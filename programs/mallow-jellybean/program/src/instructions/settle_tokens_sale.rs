use crate::{
    assert_config_line,
    constants::{AUTHORITY_SEED, SELLER_HISTORY_SEED},
    events::SettleItemSaleEvent,
    processors::{self, claim_proceeds, is_item_claimed},
    state::GumballMachine,
    try_from, AssociatedToken, ConfigLine, GumballError, SellerHistory, Token, TokenStandard,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use utils::RoyaltyInfo;

/// Settles a legacy NFT sale
#[event_cpi]
#[derive(Accounts)]
pub struct SettleTokensSale<'info> {
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

    /// Seller of the item
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

    /// buyer of the item
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
    mint: Box<Account<'info, Mint>>,

    /// CHECK: Safe due to transfer check
    #[account(mut)]
    receiver_token_account: UncheckedAccount<'info>,

    /// CHECK: Safe due to transfer check
    #[account(mut)]
    authority_pda_token_account: UncheckedAccount<'info>,
}

pub fn settle_tokens_sale<'info>(
    ctx: Context<'_, '_, '_, 'info, SettleTokensSale<'info>>,
    index: u32,
) -> Result<()> {
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let seller_history = &mut ctx.accounts.seller_history;
    let payer = &ctx.accounts.payer.to_account_info();
    let buyer = &ctx.accounts.buyer.to_account_info();
    let receiver_token_account = &ctx.accounts.receiver_token_account.to_account_info();
    let authority_pda = &mut ctx.accounts.authority_pda.to_account_info();
    let authority = &mut ctx.accounts.authority.to_account_info();
    let seller = &mut ctx.accounts.seller.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let associated_token_program = &ctx.accounts.associated_token_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let rent = &ctx.accounts.rent.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();

    assert_config_line(
        gumball_machine,
        index,
        ConfigLine {
            mint: mint.key(),
            seller: seller.key(),
            buyer: buyer.key(),
            token_standard: TokenStandard::Fungible,
        },
        false,
    )?;

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

    let mut amount = 0;
    if !is_item_claimed(gumball_machine, index)? {
        let authority_pda_token_account = &mut Box::new(try_from!(
            Account::<TokenAccount>,
            ctx.accounts.authority_pda_token_account
        )?);
        amount = processors::claim_tokens(
            gumball_machine,
            index,
            authority,
            authority_pda,
            payer,
            if buyer.key() == Pubkey::default() {
                seller
            } else {
                buyer
            },
            receiver_token_account,
            authority_pda_token_account,
            mint,
            token_program,
            associated_token_program,
            system_program,
            rent,
            &auth_seeds,
        )?;
    }

    // No royalties for tokens
    let royalty_info = RoyaltyInfo {
        is_primary_sale: false,
        seller_fee_basis_points: 0,
        creators: None,
    };

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
