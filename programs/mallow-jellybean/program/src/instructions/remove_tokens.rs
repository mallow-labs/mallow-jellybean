use crate::{
    constants::{AUTHORITY_SEED, SELLER_HISTORY_SEED},
    processors,
    state::GumballMachine,
    transfer_and_close_if_empty, AssociatedToken, GumballError, SellerHistory, Token,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

/// Add nft to a gumball machine.
#[derive(Accounts)]
pub struct RemoveTokens<'info> {
    /// Gumball Machine account.
    #[account(
        mut,
        constraint = gumball_machine.can_edit_items() @ GumballError::InvalidState,
    )]
    gumball_machine: Box<Account<'info, GumballMachine>>,

    /// Seller history account.
    #[account(
		mut,
		seeds = [
			SELLER_HISTORY_SEED.as_bytes(),
			gumball_machine.key().as_ref(),
            seller.key().as_ref(),
		],
		bump,
        has_one = gumball_machine,
        has_one = seller,
	)]
    seller_history: Box<Account<'info, SellerHistory>>,

    /// CHECK: Safe due to seeds constraint
    #[account(
        mut,
        seeds = [AUTHORITY_SEED.as_bytes(), gumball_machine.to_account_info().key.as_ref()],
        bump
    )]
    authority_pda: UncheckedAccount<'info>,

    /// Authority allowed to remove the nft (must be the gumball machine auth or the seller of the nft)
    #[account(mut)]
    authority: Signer<'info>,

    /// CHECK: Safe due to item seller check
    #[account(mut)]
    seller: UncheckedAccount<'info>,

    mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = token_account.mint == mint.key(),
        constraint = token_account.owner == seller.key(),
    )]
    token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = authority_pda_token_account.mint == mint.key(),
        constraint = authority_pda_token_account.owner == authority_pda.key(),
    )]
    authority_pda_token_account: Box<Account<'info, TokenAccount>>,

    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

// DEPRECATED: Use remove_tokens_span instead
pub fn remove_tokens(ctx: Context<RemoveTokens>, indices: Vec<u8>, amount: u64) -> Result<()> {
    let system_program = &ctx.accounts.system_program.to_account_info();
    let rent = &ctx.accounts.rent.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let associated_token_program = &ctx.accounts.associated_token_program.to_account_info();
    let authority_pda_token_account = &mut ctx.accounts.authority_pda_token_account;
    let seller_token_account = &ctx.accounts.token_account.to_account_info();
    let authority_pda = &ctx.accounts.authority_pda.to_account_info();
    let authority = &ctx.accounts.authority.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();
    let seller = &ctx.accounts.seller.to_account_info();
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let seller_history = &mut ctx.accounts.seller_history;

    processors::remove_multiple_items(
        gumball_machine,
        authority.key(),
        mint.key(),
        seller.key(),
        &indices,
        amount,
    )?;

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        ctx.accounts.gumball_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    transfer_and_close_if_empty(
        authority,
        authority_pda,
        authority_pda_token_account,
        seller,
        seller_token_account,
        mint,
        token_program,
        associated_token_program,
        system_program,
        rent,
        authority,
        &auth_seeds,
        amount
            .checked_mul(indices.len() as u64)
            .ok_or(GumballError::NumericalOverflowError)?,
    )?;

    seller_history.item_count = seller_history
        .item_count
        .checked_sub(indices.len() as u64)
        .ok_or(GumballError::NumericalOverflowError)?;

    if seller_history.item_count == 0 {
        seller_history.close(seller.to_account_info())?;
    }

    Ok(())
}

pub fn remove_tokens_span(
    ctx: Context<RemoveTokens>,
    amount: u64,
    start_index: u32,
    end_index: u32,
) -> Result<()> {
    let system_program = &ctx.accounts.system_program.to_account_info();
    let rent = &ctx.accounts.rent.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let associated_token_program = &ctx.accounts.associated_token_program.to_account_info();
    let authority_pda_token_account = &mut ctx.accounts.authority_pda_token_account;
    let seller_token_account = &ctx.accounts.token_account.to_account_info();
    let authority_pda = &ctx.accounts.authority_pda.to_account_info();
    let authority = &ctx.accounts.authority.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();
    let seller = &ctx.accounts.seller.to_account_info();
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let seller_history = &mut ctx.accounts.seller_history;

    processors::remove_multiple_items_span(
        gumball_machine,
        authority.key(),
        mint.key(),
        seller.key(),
        amount,
        start_index,
        end_index,
    )?;

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        ctx.accounts.gumball_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    let prize_count = end_index - start_index + 1;

    transfer_and_close_if_empty(
        authority,
        authority_pda,
        authority_pda_token_account,
        seller,
        seller_token_account,
        mint,
        token_program,
        associated_token_program,
        system_program,
        rent,
        authority,
        &auth_seeds,
        amount
            .checked_mul(prize_count as u64)
            .ok_or(GumballError::NumericalOverflowError)?,
    )?;

    seller_history.item_count = seller_history
        .item_count
        .checked_sub(prize_count as u64)
        .ok_or(GumballError::NumericalOverflowError)?;

    if seller_history.item_count == 0 {
        seller_history.close(seller.to_account_info())?;
    }

    Ok(())
}
