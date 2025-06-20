use crate::{
    assert_config_line_values,
    constants::{AUTHORITY_SEED, GUMBALL_MACHINE_SIZE, MPL_TOKEN_AUTH_RULES_PROGRAM},
    events::SellItemEvent,
    get_bit_byte_info, get_config_count,
    processors::transfer_nft_with_revoke,
    state::GumballMachine,
    transfer_and_close_if_empty, try_from, AssociatedToken, GumballError, GumballState, Token,
    TokenStandard,
};
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use mpl_core::{
    instructions::{TransferV1CpiBuilder, UpdatePluginV1CpiBuilder},
    types::{FreezeDelegate, Plugin},
};
use mpl_token_metadata::accounts::Metadata;
use utils::{get_bps_of, is_native_mint, transfer_from_pda};

/// Settles a legacy NFT sale
#[event_cpi]
#[derive(Accounts)]
pub struct SellItem<'info> {
    /// Must be the oracle signer or seller (oracle signer can sell on behalf of the seller to allow auto-buy back)
    #[account(
        mut,
        constraint = payer.key() == seller.key() || payer.key() == oracle_signer.key() @ GumballError::InvalidPayer
    )]
    payer: Signer<'info>,

    /// Oracle signer
    /// CHECK: Checked in the instruction
    oracle_signer: Signer<'info>,

    /// Gumball machine account.
    #[account(
        mut,
        constraint = gumball_machine.state == GumballState::SaleLive || gumball_machine.state == GumballState::SaleEnded @ GumballError::InvalidState
    )]
    gumball_machine: Box<Account<'info, GumballMachine>>,

    /// CHECK: Safe due to seeds constraint
    #[account(
        mut,
        seeds = [
            AUTHORITY_SEED.as_bytes(), 
            gumball_machine.key().as_ref()
        ],
        bump
    )]
    authority_pda: UncheckedAccount<'info>,

    /// Mint of the item (or asset for Core assets)
    /// CHECK: Safe due to item check
    #[account(mut)]
    mint: UncheckedAccount<'info>,

    /// Seller of the item
    /// CHECK: Safe due to item check
    #[account(mut)]
    seller: UncheckedAccount<'info>,

    /// Buyer of the item
    /// CHECK: Safe due to item check
    #[account(mut)]
    buyer: UncheckedAccount<'info>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    rent: Sysvar<'info, Rent>,

    /// OPTIONAL FEE ACCOUNTS - only required if there is a fee config on the gumball machine

    /// Marketplace fee account
    /// CHECK: Safe due to constraint
    #[account(mut)]
    fee_account: Option<UncheckedAccount<'info>>,
    /// Marketplace fee payment account
    /// CHECK: Safe due to transfer checks
    #[account(mut)]
    fee_payment_account: Option<UncheckedAccount<'info>>,

    /// OPTIONAL SPL TOKEN ACCOUNTS - only required if selling for SPL token

    /// Mint of payment token
    /// CHECK: Safe due to item check
    #[account(mut)]
    payment_mint: Option<UncheckedAccount<'info>>,
    /// Seller payment account
    /// CHECK: Safe due to transfer checks
    #[account(mut)]
    seller_payment_account: Option<UncheckedAccount<'info>>,
    /// Authority PDA payment account
    /// CHECK: Safe due to transfer checks
    #[account(mut)]
    authority_pda_payment_account: Option<UncheckedAccount<'info>>,

    /// OPTIONAL CORE ASSET ACCOUNTS - only required if selling Core asset

    /// Collection of the asset
    /// CHECK: Safe due to item check
    #[account(mut)]
    collection: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to constraint
    #[account(address = mpl_core::ID)]
    mpl_core_program: Option<UncheckedAccount<'info>>,

    /// OPTIONAL TOKEN ACCOUNTS - only required if selling NFT or Fungible assets

    /// Authority PDA token account
    #[account(mut)]
    authority_pda_token_account: Option<UncheckedAccount<'info>>,
    /// Seller token account
    /// CHECK: Safe due to transfer checks
    #[account(mut)]
    seller_token_account: Option<UncheckedAccount<'info>>,
    /// Buyer token account
    /// CHECK: Safe due to transfer checks
    #[account(mut)]
    buyer_token_account: Option<UncheckedAccount<'info>>,

    /// OPTIONAL NFT ACCOUNTS - only required if selling NFT or PNFT

    /// CHECK: Safe due to processor royalties check
    #[account(mut)]
    metadata: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to thaw/send
    #[account(mut)]
    edition: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to constraint
    #[account(address = mpl_token_metadata::ID)]
    token_metadata_program: Option<UncheckedAccount<'info>>,

    /// OPTIONAL PNFT ACCOUNTS - only required if selling PNFT

    /// CHECK: Safe due to token metadata program check
    #[account(mut)]
    pub authority_pda_token_record: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to token metadata program check
    #[account(mut)]
    pub buyer_token_record: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to token metadata program check
    pub auth_rules: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to address check
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to address check
    #[account(address = MPL_TOKEN_AUTH_RULES_PROGRAM)]
    pub auth_rules_program: Option<UncheckedAccount<'info>>,
}

pub fn sell_item<'info>(
    ctx: Context<'_, '_, '_, 'info, SellItem<'info>>,
    index: u32,
    amount: u64,
    buy_price: u64,
) -> Result<()> {
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    require!(gumball_machine.version >= 4, GumballError::InvalidVersion);

    let payer = &ctx.accounts.payer.to_account_info();
    let oracle_signer = &ctx.accounts.oracle_signer.to_account_info();
    let authority_pda = &mut ctx.accounts.authority_pda.to_account_info();
    let seller = &mut ctx.accounts.seller.to_account_info();
    let buyer = &mut ctx.accounts.buyer.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let associated_token_program = &ctx.accounts.associated_token_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let rent = &ctx.accounts.rent.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();

    let account_info = gumball_machine.to_account_info();
    let mut gumball_data = account_info.data.borrow_mut();

    let buy_back_config = gumball_machine.get_buy_back_config(&gumball_data)?;
    require!(buy_back_config.enabled, GumballError::BuyBackNotEnabled);
    require!(
        oracle_signer.key() == buy_back_config.oracle_signer,
        GumballError::InvalidOracleSigner
    );

    let cutoff_pct = buy_back_config.cutoff_pct;
    if cutoff_pct > 0 {
        let items_loaded = get_config_count(&gumball_data)? as u64;
        let items_sold = gumball_machine.items_redeemed;
        let items_remaining = items_loaded
            .checked_sub(items_sold)
            .ok_or(GumballError::NumericalOverflowError)?;
        require!(
            items_remaining
                .checked_mul(100)
                .ok_or(GumballError::NumericalOverflowError)?
                .checked_div(items_loaded)
                .ok_or(GumballError::NumericalOverflowError)?
                > cutoff_pct as u64,
            GumballError::BuyBackCutoffReached
        );
    }

    let config_line_position =
        GUMBALL_MACHINE_SIZE + 4 + (index as usize) * gumball_machine.get_config_line_size();

    let config_line = assert_config_line_values(
        &gumball_data,
        config_line_position,
        index,
        mint.key(),
        gumball_machine.authority,
        seller.key(),
    )?;

    // Make sure amount of assets being sold is correct
    require!(config_line.amount == amount, GumballError::InvalidAmount);

    // Make sure buyer is valid
    let buy_back_buyer = if buy_back_config.to_gumball_machine {
        gumball_machine.key()
    } else {
        gumball_machine.authority
    };
    require!(buy_back_buyer == buyer.key(), GumballError::InvalidBuyer);

    // Check if item is already claimed
    let bit_mask_start = gumball_machine.get_claimed_items_bit_mask_position();
    let (byte_position, _bit, mask) = get_bit_byte_info(bit_mask_start, index as usize)?;
    let current_value = gumball_data[byte_position];
    let is_claimed = current_value & mask == mask;
    require!(!is_claimed, GumballError::ItemAlreadyClaimed);

    if buy_back_config.to_gumball_machine {
        // TODO: Implement buy back to gumball machine logic
        require!(false, GumballError::NotImplemented);
    } else {
        // Mark item as claimed if buying back to creator
        gumball_data[byte_position] |= mask;
    }

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        gumball_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    if !buy_back_config.to_gumball_machine {
        match config_line.token_standard {
            TokenStandard::Fungible => {
                let authority_pda_token_account = &mut Box::new(try_from!(
                    Account::<TokenAccount>,
                    ctx.accounts.authority_pda_token_account.as_ref().unwrap()
                )?);

                transfer_and_close_if_empty(
                    payer,
                    authority_pda,
                    authority_pda_token_account,
                    buyer,
                    &ctx.accounts
                        .buyer_token_account
                        .as_ref()
                        .unwrap()
                        .to_account_info(),
                    mint,
                    token_program,
                    associated_token_program,
                    system_program,
                    rent,
                    buyer,
                    &auth_seeds,
                    amount,
                )?;
            }
            TokenStandard::Core => {
                let mpl_core_program = &ctx
                    .accounts
                    .mpl_core_program
                    .as_ref()
                    .unwrap()
                    .to_account_info();
                let collection = ctx
                    .accounts
                    .collection
                    .as_ref()
                    .map(|a| a.to_account_info());
                let collection_info = collection.as_ref();
                UpdatePluginV1CpiBuilder::new(mpl_core_program)
                    .asset(mint)
                    .collection(collection_info)
                    .payer(payer)
                    .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: false }))
                    .authority(Some(authority_pda))
                    .system_program(system_program)
                    .invoke_signed(&[&auth_seeds])?;
                TransferV1CpiBuilder::new(mpl_core_program)
                    .asset(mint)
                    .collection(collection_info)
                    .payer(payer)
                    .authority(Some(authority_pda))
                    .new_owner(buyer)
                    .system_program(Some(system_program))
                    .invoke_signed(&[&auth_seeds])?;
            }
            TokenStandard::NonFungible | TokenStandard::ProgrammableNonFungible => {
                let metadata_info = &ctx.accounts.metadata.as_ref().unwrap().to_account_info();
                let metadata = &Metadata::try_from(metadata_info)?;
                transfer_nft_with_revoke(
                    authority_pda,
                    payer,
                    buyer,
                    &ctx.accounts
                        .buyer_token_account
                        .as_ref()
                        .unwrap()
                        .to_account_info(),
                    buyer,
                    &ctx.accounts
                        .buyer_token_account
                        .as_ref()
                        .unwrap()
                        .to_account_info(),
                    &ctx.accounts
                        .authority_pda_token_account
                        .as_ref()
                        .unwrap()
                        .to_account_info(),
                    mint,
                    &ctx.accounts.edition.as_ref().unwrap().to_account_info(),
                    metadata,
                    metadata_info,
                    token_program,
                    associated_token_program,
                    &ctx.accounts
                        .token_metadata_program
                        .as_ref()
                        .unwrap()
                        .to_account_info(),
                    system_program,
                    rent,
                    &auth_seeds,
                    ctx.accounts.buyer_token_record.as_ref(),
                    ctx.accounts.authority_pda_token_record.as_ref(),
                    ctx.accounts.buyer_token_record.as_ref(),
                    ctx.accounts.auth_rules.as_ref(),
                    ctx.accounts.instructions.as_ref(),
                    ctx.accounts.auth_rules_program.as_ref(),
                    Some(seller),
                )?;
            }
        }
    }

    let authority_pda_payment_account = ctx
        .accounts
        .authority_pda_payment_account
        .as_ref()
        .map(|a| a.to_account_info());
    let authority_pda_payment_account_info = authority_pda_payment_account.as_ref();
    let seller_payment_account = ctx
        .accounts
        .seller_payment_account
        .as_ref()
        .map(|a| a.to_account_info());
    let seller_payment_account_info = seller_payment_account.as_ref();
    let payment_mint = ctx
        .accounts
        .payment_mint
        .as_ref()
        .map(|a| a.to_account_info());
    let payment_mint_info = payment_mint.as_ref();

    if is_native_mint(gumball_machine.settings.payment_mint) {
        require!(
            payment_mint_info.is_none(),
            GumballError::InvalidPaymentMint
        );
    } else {
        require!(
            payment_mint_info.is_some()
                && payment_mint_info.unwrap().key() == gumball_machine.settings.payment_mint,
            GumballError::InvalidPaymentMint
        );
    }

    // Pay the seller from the buy back funds
    transfer_from_pda(
        authority_pda,
        seller,
        authority_pda_payment_account_info,
        seller_payment_account_info,
        payment_mint_info,
        Some(payer),
        associated_token_program,
        token_program,
        system_program,
        rent,
        &auth_seeds,
        None,
        buy_price,
    )?;

    // Pay the marketplace fee
    let marketplace_fee = get_bps_of(buy_price, buy_back_config.marketplace_fee_bps)?;
    if marketplace_fee > 0 {
        let fee_account = &mut ctx.accounts.fee_account.as_mut().unwrap().to_account_info();
        let fee_payment_account = ctx
            .accounts
            .fee_payment_account
            .as_ref()
            .map(|a| a.to_account_info());
        let fee_payment_account_info = fee_payment_account.as_ref();

        // Pay the marketplace fee from the buy back funds
        transfer_from_pda(
            authority_pda,
            fee_account,
            authority_pda_payment_account_info,
            fee_payment_account_info,
            payment_mint_info,
            Some(payer),
            associated_token_program,
            token_program,
            system_program,
            rent,
            &auth_seeds,
            None,
            marketplace_fee,
        )?;
    }

    // Make sure there are enough buy back funds available
    let buy_back_funds_available = gumball_machine.get_buy_back_funds_available(&gumball_data)?;
    msg!("buy_back_funds_available: {}", buy_back_funds_available);
    require!(
        buy_back_funds_available
            .checked_add(marketplace_fee)
            .ok_or(GumballError::NumericalOverflowError)?
            >= buy_price,
        GumballError::InsufficientFunds
    );

    // Decrement buy back funds available
    let buy_back_funds_available_position =
        gumball_machine.get_buy_back_funds_available_position()?;
    let new_buy_back_funds_available = buy_back_funds_available
        .checked_sub(buy_price)
        .ok_or(GumballError::NumericalOverflowError)?
        .checked_sub(marketplace_fee)
        .ok_or(GumballError::NumericalOverflowError)?;
    gumball_data[buy_back_funds_available_position..buy_back_funds_available_position + 8]
        .copy_from_slice(&new_buy_back_funds_available.to_le_bytes());

    msg!(
        "new_buy_back_funds_available: {}",
        new_buy_back_funds_available
    );

    drop(gumball_data);

    emit_cpi!(SellItemEvent {
        mint: mint.key(),
        authority: gumball_machine.authority.key(),
        seller: seller.key(),
        buyer: buyer.key(),
        amount: config_line.amount,
        token_standard: config_line.token_standard,
    });

    Ok(())
}
