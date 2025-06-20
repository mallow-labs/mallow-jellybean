use crate::{
    constants::AUTHORITY_SEED, get_config_count, transfer_and_close_if_empty, try_from,
    GumballError, GumballMachine, Token,
};
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use utils::{assert_is_ata, is_native_mint};

/// Withdraw the rent SOL from the gumball machine account.
#[derive(Accounts)]
pub struct CloseGumballMachine<'info> {
    /// Gumball Machine acccount.
    #[account(
        mut, 
        close = authority, 
        has_one = authority @ GumballError::InvalidAuthority,
        has_one = mint_authority @ GumballError::InvalidMintAuthority
    )]
    gumball_machine: Account<'info, GumballMachine>,

    /// Authority of the gumball machine.
    #[account(mut)]
    authority: Signer<'info>,

    /// Mint authority of the gumball machine.
    #[account(mut)]
    mint_authority: Signer<'info>,

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
    /// CHECK: Safe due to ata check in processor
    #[account(mut)]
    authority_pda_payment_account: Option<UncheckedAccount<'info>>,

    token_program: Program<'info, Token>,
}

pub fn close_gumball_machine<'info>(
    ctx: Context<'_, '_, '_, 'info, CloseGumballMachine<'info>>,
) -> Result<()> {
    let account_info = ctx.accounts.gumball_machine.to_account_info();
    let account_data = account_info.data.borrow();

    if ctx.accounts.gumball_machine.version >= 4 {
        // Make sure user has withdrawn all buy back funds
        require!(
            ctx.accounts
                .gumball_machine
                .get_buy_back_funds_available(&account_data)?
                == 0,
            GumballError::BuyBackFundsNotZero
        );
    }

    let config_count = get_config_count(&account_data)? as u64;
    // No items added so it's safe to close the account
    if config_count == 0 {
        return Ok(());
    }

    // Ensure all items have been settled/claimed
    require!(
        config_count == ctx.accounts.gumball_machine.items_settled,
        GumballError::NotAllSettled
    );

    let token_program = &ctx.accounts.token_program.to_account_info();
    let authority = &ctx.accounts.authority.to_account_info();
    let authority_pda = &ctx.accounts.authority_pda.to_account_info();
    let payment_mint = ctx.accounts.gumball_machine.settings.payment_mint;

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        ctx.accounts.gumball_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    // Close payment account if using payment token
    if !is_native_mint(payment_mint) {
        let authority_pda_payment_account = &ctx
            .accounts
            .authority_pda_payment_account
            .as_ref()
            .unwrap()
            .to_account_info();

        if !authority_pda_payment_account.data_is_empty() {
            assert_is_ata(
                authority_pda_payment_account,
                authority_pda.key,
                &payment_mint,
            )?;

            // Transfer remaining balance to authority if there's any
            let token_account = &mut Box::new(try_from!(
                Account::<'info, TokenAccount>,
                authority_pda_payment_account
            )?);
            let iter = &mut ctx.remaining_accounts.iter();
            let mint = next_account_info(iter)?;
            let to_token_account = next_account_info(iter)?;
            let ata_program = next_account_info(iter)?;
            let system_program = next_account_info(iter)?;
            let rent = next_account_info(iter)?;

            transfer_and_close_if_empty(
                authority,
                authority_pda,
                token_account,
                authority,
                to_token_account,
                mint,
                token_program,
                ata_program,
                system_program,
                rent,
                authority,
                &auth_seeds,
                token_account.amount,
            )?;
        }
    }

    Ok(())
}
