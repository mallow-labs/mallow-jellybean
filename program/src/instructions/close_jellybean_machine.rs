use crate::{JellybeanError, JellybeanMachine};
use anchor_lang::prelude::*;

/// Withdraw the rent SOL from the jellybean machine account.
#[derive(Accounts)]
pub struct CloseJellybeanMachine<'info> {
    /// Gumball Machine acccount.
    #[account(
        mut, 
        close = authority, 
        has_one = authority @ JellybeanError::InvalidAuthority,
        has_one = mint_authority @ JellybeanError::InvalidMintAuthority,
    )]
    jellybean_machine: Account<'info, JellybeanMachine>,

    /// Authority of the jellybean machine.
    #[account(mut)]
    authority: Signer<'info>,

    /// Mint authority of the jellybean machine.
    #[account(mut)]
    mint_authority: Signer<'info>,
}

pub fn close_jellybean_machine<'info>(
    _: Context<'_, '_, '_, 'info, CloseJellybeanMachine<'info>>,
) -> Result<()> {
    Ok(())
}
