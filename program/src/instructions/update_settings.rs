use crate::{
    state::JellybeanMachine, utils::validate_settings_args, SettingsArgs, MAX_FEE_ACCOUNTS,
    MAX_URI_LENGTH,
};
use anchor_lang::prelude::*;

/// Initializes a new jellybean machine.
#[derive(Accounts)]
pub struct UpdateSettings<'info> {
    /// Gumball machine account.
    #[account(
        mut, 
        has_one = authority
    )]
    jellybean_machine: Box<Account<'info, JellybeanMachine>>,

    /// Gumball Machine authority. This is the address that controls the upate of the jellybean machine.
    #[account(mut)]
    authority: Signer<'info>,
}

pub fn update_settings(ctx: Context<UpdateSettings>, args: SettingsArgs) -> Result<()> {
    let jellybean_machine = &mut ctx.accounts.jellybean_machine;

    // Validate settings arguments
    validate_settings_args(&args, MAX_URI_LENGTH)?;

    let mut fee_accounts_array = [None; MAX_FEE_ACCOUNTS];
    let copy_len = args.fee_accounts.len().min(MAX_FEE_ACCOUNTS);
    fee_accounts_array[..copy_len].copy_from_slice(&args.fee_accounts[..copy_len]);

    jellybean_machine.fee_accounts = fee_accounts_array;
    jellybean_machine.uri = args.uri;

    Ok(())
}
