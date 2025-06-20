use crate::{
    assert_can_add_item,
    constants::{AUTHORITY_SEED, SELLER_HISTORY_SEED},
    state::GumballMachine,
    ConfigLineV2Input, GumballError, SellerHistory, Token, TokenStandard,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, TokenAccount},
};
use utils::transfer_spl;

use super::AddItemArgs;

/// Add nft to a gumball machine.
#[derive(Accounts)]
pub struct AddTokens<'info> {
    /// Gumball Machine account.
    #[account(
        mut,
        constraint = gumball_machine.can_add_items() @ GumballError::InvalidState,
    )]
    gumball_machine: Box<Account<'info, GumballMachine>>,

    /// Seller history account.
    #[account(
		init_if_needed,
		seeds = [
			SELLER_HISTORY_SEED.as_bytes(),
			gumball_machine.key().as_ref(),
            seller.key().as_ref(),
		],
		bump,
		space = SellerHistory::SPACE,
		payer = seller
	)]
    seller_history: Box<Account<'info, SellerHistory>>,

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

    /// Seller of the tokens
    #[account(mut)]
    seller: Signer<'info>,

    mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = token_account.mint == mint.key(),
        constraint = token_account.owner == seller.key(),
    )]
    token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Safe due to transfer checks
    #[account(mut)]
    authority_pda_token_account: UncheckedAccount<'info>,

    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

pub fn add_tokens(
    ctx: Context<AddTokens>,
    amount: u64,
    quantity: u16,
    args: AddItemArgs,
) -> Result<()> {
    let token_program = &ctx.accounts.token_program.to_account_info();
    let ata_program = &ctx.accounts.associated_token_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let rent = &ctx.accounts.rent.to_account_info();
    let authority_pda = &ctx.accounts.authority_pda.to_account_info();
    let seller = &ctx.accounts.seller.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();
    let seller_token_account = &ctx.accounts.token_account.to_account_info();
    let authority_pda_token_account = &ctx.accounts.authority_pda_token_account.to_account_info();
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let seller_history = &mut ctx.accounts.seller_history;

    seller_history.gumball_machine = gumball_machine.key();
    seller_history.seller = seller.key();

    // Validate the seller
    assert_can_add_item(gumball_machine, seller_history, quantity, &args)?;

    seller_history.item_count = seller_history
        .item_count
        .checked_add(quantity.into())
        .ok_or(GumballError::NumericalOverflowError)?;

    crate::processors::add_item(
        gumball_machine,
        ConfigLineV2Input {
            mint: ctx.accounts.mint.key(),
            seller: ctx.accounts.seller.key(),
            amount,
        },
        TokenStandard::Fungible,
        quantity,
        args.index,
    )?;

    transfer_spl(
        seller,
        authority_pda,
        seller_token_account,
        authority_pda_token_account,
        mint,
        seller,
        ata_program,
        token_program,
        system_program,
        rent,
        None,
        None,
        None,
        amount
            .checked_mul(quantity.into())
            .ok_or(GumballError::NumericalOverflowError)?,
    )?;

    Ok(())
}
