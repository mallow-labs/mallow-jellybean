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
        constraint = jellybean_machine.supply_redeemed == jellybean_machine.supply_settled @ JellybeanError::NotAllSettled
    )]
    jellybean_machine: Account<'info, JellybeanMachine>,

    /// Authority of the jellybean machine.
    #[account(mut)]
    authority: Signer<'info>,

    /// Mint authority of the jellybean machine.
    #[account(mut)]
    mint_authority: Signer<'info>,

    token_program: Program<'info, anchor_spl::token::Token>,
}

pub fn close_jellybean_machine<'info>(
    _: Context<'_, '_, '_, 'info, CloseJellybeanMachine<'info>>,
) -> Result<()> {
    Ok(())
}
