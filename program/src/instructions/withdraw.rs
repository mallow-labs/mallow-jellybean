use crate::{JellybeanError, JellybeanMachine};
use anchor_lang::prelude::*;

/// Withdraw the rent SOL from the jellybean machine account.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// Gumball Machine acccount.
    #[account(
        mut,
        close = authority,
        has_one = authority @ JellybeanError::InvalidAuthority,
        has_one = mint_authority @ JellybeanError::InvalidMintAuthority,
        constraint = jellybean_machine.items_loaded == 0 @ JellybeanError::ItemsStillLoaded,
    )]
    jellybean_machine: Account<'info, JellybeanMachine>,

    /// Authority of the jellybean machine.
    #[account(mut)]
    authority: Signer<'info>,

    /// Mint authority of the jellybean machine.
    #[account(mut)]
    mint_authority: Signer<'info>,
}

pub fn withdraw<'info>(_: Context<'_, '_, '_, 'info, Withdraw<'info>>) -> Result<()> {
    Ok(())
}
