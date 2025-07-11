use crate::{state::JellybeanMachine, utils::validate_settings_args, SettingsArgs};
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
    validate_settings_args(&args)?;

    jellybean_machine.fee_accounts = args.fee_accounts;
    jellybean_machine.print_fee_config = args.print_fee_config;
    jellybean_machine.uri = args.uri;

    Ok(())
}
