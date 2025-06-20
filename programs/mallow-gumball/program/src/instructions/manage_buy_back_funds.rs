use crate::{constants::AUTHORITY_SEED, GumballError, GumballMachine, Token};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use utils::{transfer, transfer_from_pda};

/// Manage the buy back funds of the gumball machine.
#[derive(Accounts)]
pub struct ManageBuyBackFunds<'info> {
    /// Gumball Machine acccount.
    #[account(
        mut,
        has_one = authority @ GumballError::InvalidAuthority,
    )]
    gumball_machine: Account<'info, GumballMachine>,

    /// Authority of the gumball machine.
    #[account(mut)]
    authority: Signer<'info>,

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

    /// Authority's token account if using token payment
    /// CHECK: Safe due to ata check in processor
    #[account(mut)]
    authority_payment_account: Option<UncheckedAccount<'info>>,

    /// Payment account for authority pda if using token payment
    /// CHECK: Safe due to ata check in processor
    #[account(mut)]
    authority_pda_payment_account: Option<UncheckedAccount<'info>>,

    /// Payment mint if using non-native payment token
    payment_mint: Option<UncheckedAccount<'info>>,

    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

pub fn manage_buy_back_funds<'info>(
    ctx: Context<'_, '_, '_, 'info, ManageBuyBackFunds<'info>>,
    amount: u64,
    is_withdraw: bool,
) -> Result<()> {
    let account_info = ctx.accounts.gumball_machine.to_account_info();
    let mut account_data = account_info.data.borrow_mut();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let authority = &mut ctx.accounts.authority.to_account_info();
    let authority_pda = &mut ctx.accounts.authority_pda.to_account_info();
    let associated_token_program = &ctx.accounts.associated_token_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let rent = &ctx.accounts.rent.to_account_info();

    // Set up payment accounts
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

    let buy_back_config = ctx
        .accounts
        .gumball_machine
        .get_buy_back_config(&account_data)?;

    if is_withdraw {
        require!(
            ctx.accounts
                .gumball_machine
                .get_buy_back_funds_available(&account_data)?
                >= amount,
            GumballError::InsufficientFunds
        );

        let auth_seeds = [
            AUTHORITY_SEED.as_bytes(),
            ctx.accounts.gumball_machine.to_account_info().key.as_ref(),
            &[ctx.bumps.authority_pda],
        ];

        transfer_from_pda(
            authority_pda,
            authority,
            authority_pda_payment_account,
            authority_payment_account,
            payment_mint,
            None,
            associated_token_program,
            token_program,
            system_program,
            rent,
            &auth_seeds,
            None,
            amount,
        )?;
    } else {
        require!(buy_back_config.enabled, GumballError::BuyBackNotEnabled);

        transfer(
            authority,
            authority_pda,
            authority_payment_account,
            authority_pda_payment_account,
            payment_mint,
            None,
            associated_token_program,
            token_program,
            system_program,
            Some(rent),
            None,
            None,
            amount,
        )?;
    }

    let buy_back_funds_available_position = ctx
        .accounts
        .gumball_machine
        .get_buy_back_funds_available_position()?;
    let buy_back_funds_available = ctx
        .accounts
        .gumball_machine
        .get_buy_back_funds_available(&account_data)?;
    let new_buy_back_funds_available = if is_withdraw {
        buy_back_funds_available
            .checked_sub(amount)
            .ok_or(GumballError::NumericalOverflowError)?
    } else {
        buy_back_funds_available
            .checked_add(amount)
            .ok_or(GumballError::NumericalOverflowError)?
    };
    account_data[buy_back_funds_available_position..buy_back_funds_available_position + 8]
        .copy_from_slice(&new_buy_back_funds_available.to_le_bytes());

    drop(account_data);

    Ok(())
}
