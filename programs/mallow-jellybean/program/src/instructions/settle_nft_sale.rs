use crate::{
    assert_config_line,
    constants::{AUTHORITY_SEED, MPL_TOKEN_AUTH_RULES_PROGRAM, SELLER_HISTORY_SEED},
    events::SettleItemSaleEvent,
    processors::{self, claim_proceeds, is_item_claimed},
    state::GumballMachine,
    token_standard_from_mpl_token_standard, AssociatedToken, ConfigLine, GumballError,
    SellerHistory, Token, TokenStandard,
};
use anchor_lang::prelude::*;
use mpl_token_metadata::{accounts::Metadata, instructions::UpdateMetadataAccountV2CpiBuilder};
use utils::{assert_keys_equal, get_verified_royalty_info, RoyaltyInfo};

/// Settles a legacy NFT sale
#[event_cpi]
#[derive(Accounts)]
pub struct SettleNftSale<'info> {
    /// Anyone can settle the sale
    #[account(mut)]
    payer: Signer<'info>,

    /// Gumball machine account.
    #[account(
        mut,
        has_one = authority @ GumballError::InvalidAuthority,
        constraint = gumball_machine.can_settle_items() @ GumballError::InvalidState
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

    /// Payment account for authority pda if using token payment
    #[account(mut)]
    authority_pda_payment_account: Option<UncheckedAccount<'info>>,

    /// Seller of the nft
    /// CHECK: Safe due to gumball machine constraint
    #[account(mut)]
    authority: UncheckedAccount<'info>,

    /// Payment account for authority if using token payment
    #[account(mut)]
    authority_payment_account: Option<UncheckedAccount<'info>>,

    /// Seller of the nft
    /// CHECK: Safe due to item check
    #[account(mut)]
    seller: UncheckedAccount<'info>,

    /// Payment account for seller if using token payment
    #[account(mut)]
    seller_payment_account: Option<UncheckedAccount<'info>>,

    /// Seller history account.
    #[account(
        mut,
        seeds = [
            SELLER_HISTORY_SEED.as_bytes(),
            gumball_machine.key().as_ref(),
            seller.key().as_ref()
        ],
        bump
    )]
    seller_history: Box<Account<'info, SellerHistory>>,

    /// buyer of the nft
    /// CHECK: Safe due to item check
    buyer: UncheckedAccount<'info>,

    /// Fee account for marketplace fee if using fee config
    #[account(mut)]
    fee_account: Option<UncheckedAccount<'info>>,

    /// Payment account for marketplace fee if using token payment
    #[account(mut)]
    fee_payment_account: Option<UncheckedAccount<'info>>,

    /// Payment mint if using non-native payment token
    payment_mint: Option<UncheckedAccount<'info>>,

    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,

    /// CHECK: Safe due to item check
    mint: UncheckedAccount<'info>,

    /// CHECK: Safe due to thaw/transfer
    #[account(mut)]
    token_account: UncheckedAccount<'info>,

    /// Nft token account for buyer
    /// CHECK: Safe due to ata check in transfer
    #[account(mut)]
    buyer_token_account: UncheckedAccount<'info>,

    /// CHECK: Safe due to transfer
    #[account(mut)]
    authority_pda_token_account: UncheckedAccount<'info>,

    /// CHECK: Safe due to processor royalties check
    #[account(mut)]
    metadata: UncheckedAccount<'info>,

    /// CHECK: Safe due to thaw/send
    #[account(mut)]
    edition: UncheckedAccount<'info>,

    /// CHECK: Safe due to constraint
    #[account(address = mpl_token_metadata::ID)]
    token_metadata_program: UncheckedAccount<'info>,

    /// OPTIONAL PNFT ACCOUNTS
    /// CHECK: Safe due to token metadata program check
    #[account(mut)]
    pub seller_token_record: Option<UncheckedAccount<'info>>,
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

pub fn settle_nft_sale<'info>(
    ctx: Context<'_, '_, '_, 'info, SettleNftSale<'info>>,
    index: u32,
) -> Result<()> {
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let seller_history = &mut ctx.accounts.seller_history;
    let payer = &ctx.accounts.payer.to_account_info();
    let buyer = &ctx.accounts.buyer.to_account_info();
    let buyer_token_account = &ctx.accounts.buyer_token_account.to_account_info();
    let authority_pda_token_account = &ctx.accounts.authority_pda_token_account.to_account_info();
    let authority_pda = &mut ctx.accounts.authority_pda.to_account_info();
    let authority = &mut ctx.accounts.authority.to_account_info();
    let seller = &mut ctx.accounts.seller.to_account_info();
    let seller_for_to = &ctx.accounts.seller.to_account_info();
    let token_metadata_program = &ctx.accounts.token_metadata_program.to_account_info();
    let token_account = &ctx.accounts.token_account.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let associated_token_program = &ctx.accounts.associated_token_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let rent = &ctx.accounts.rent.to_account_info();
    let edition = &ctx.accounts.edition.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();
    let metadata_info = &ctx.accounts.metadata.to_account_info();
    let metadata = if metadata_info.data_len() <= 1 { 
        None
     } else { 
        Some(Metadata::try_from(metadata_info)?)
     };
    let token_standard = if let Some(metadata) = &metadata {
        Some(token_standard_from_mpl_token_standard(metadata)?)
    } else {
        None
    };
    let is_burnt = metadata.is_none();

    if is_burnt {
        // Verify the metadata_info key is the correct one
        let (expected_pda, _) = Metadata::find_pda(mint.key);
        assert_keys_equal(expected_pda, metadata_info.key(), "Invalid metadata PDA")?;
    }

    assert_config_line(
        gumball_machine,
        index,
        ConfigLine {
            mint: mint.key(),
            seller: seller.key(),
            buyer: buyer.key(),
            token_standard: token_standard.unwrap_or(TokenStandard::NonFungible),
        },
        is_burnt,
    )?;

    let royalty_info = if is_burnt {
        RoyaltyInfo::default()
    } else {
        get_verified_royalty_info(metadata_info, mint)?
    };

    let payment_mint_info = ctx
        .accounts
        .payment_mint
        .as_ref()
        .map(|mint| mint.to_account_info());
    let payment_mint = payment_mint_info.as_ref();

    let authority_pda_payment_account_info = ctx
        .accounts
        .authority_pda_payment_account
        .as_ref()
        .map(|account| account.to_account_info());
    let authority_pda_payment_account = authority_pda_payment_account_info.as_ref();

    let authority_payment_account_info = ctx
        .accounts
        .authority_payment_account
        .as_ref()
        .map(|account| account.to_account_info());
    let authority_payment_account = authority_payment_account_info.as_ref();

    let seller_payment_account_info = ctx
        .accounts
        .seller_payment_account
        .as_ref()
        .map(|account| account.to_account_info());
    let seller_payment_account = seller_payment_account_info.as_ref();

    let mut fee_account_info = ctx
        .accounts
        .fee_account
        .as_ref()
        .map(|account| account.to_account_info());
    let fee_account = fee_account_info.as_mut();

    let fee_payment_account_info = ctx
        .accounts
        .fee_payment_account
        .as_ref()
        .map(|account| account.to_account_info());
    let fee_payment_account = fee_payment_account_info.as_ref();

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        gumball_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    if royalty_info.is_primary_sale
        && token_standard == Some(TokenStandard::NonFungible)
        && metadata.as_ref().unwrap().update_authority == payer.key()
    {
        let mut builder = UpdateMetadataAccountV2CpiBuilder::new(token_metadata_program);
        builder
            .metadata(metadata_info)
            .update_authority(payer)
            .primary_sale_happened(true)
            .invoke()?;
    }

    let mut amount = 0;
    if !is_item_claimed(gumball_machine, index)? {
        amount = 1;

        processors::claim_nft_v2(
            gumball_machine,
            index,
            authority_pda,
            payer,
            if buyer.key() == Pubkey::default() {
                seller_for_to
            } else {
                buyer
            },
            if buyer.key() == Pubkey::default() {
                token_account
            } else {
                buyer_token_account
            },
            seller,
            token_account,
            authority_pda_token_account,
            mint,
            edition,
            // Metadata must exist if not yet claimed
            metadata.as_ref().unwrap(),
            metadata_info,
            token_program,
            associated_token_program,
            token_metadata_program,
            system_program,
            rent,
            &auth_seeds,
            ctx.accounts.seller_token_record.as_ref(),
            ctx.accounts.authority_pda_token_record.as_ref(),
            if buyer.key() == Pubkey::default() {
                ctx.accounts.seller_token_record.as_ref()
            } else {
                ctx.accounts.buyer_token_record.as_ref()
            },
            ctx.accounts.auth_rules.as_ref(),
            ctx.accounts.instructions.as_ref(),
            ctx.accounts.auth_rules_program.as_ref(),
        )?;
    }

    let total_proceeds = claim_proceeds(
        gumball_machine,
        index,
        seller_history,
        payer,
        authority_pda,
        authority_pda_payment_account,
        authority,
        authority_payment_account,
        seller,
        seller_payment_account,
        fee_account,
        fee_payment_account,
        payment_mint,
        &royalty_info,
        &ctx.remaining_accounts,
        associated_token_program,
        token_program,
        system_program,
        rent,
        &auth_seeds,
    )?;

    emit_cpi!(SettleItemSaleEvent {
        mint: mint.key(),
        authority: gumball_machine.authority.key(),
        seller: seller.key(),
        buyer: buyer.key(),
        total_proceeds,
        payment_mint: gumball_machine.settings.payment_mint,
        fee_config: gumball_machine.marketplace_fee_config,
        curator_fee_bps: gumball_machine.settings.curator_fee_bps,
        amount
    });

    Ok(())
}
