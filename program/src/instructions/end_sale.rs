use crate::{state::JellybeanMachine, JellybeanError, JellybeanState};
use anchor_lang::prelude::*;

/// Disables minting and allows sales to be settled
#[derive(Accounts)]
pub struct EndSale<'info> {
    /// Gumball machine account.
    #[account(
        mut,
        has_one = authority,
        constraint = jellybean_machine.state != JellybeanState::SaleEnded @ JellybeanError::InvalidState
    )]
    jellybean_machine: Box<Account<'info, JellybeanMachine>>,

    /// Gumball Machine authority. This is the address that controls the upate of the jellybean machine.
    #[account(mut)]
    authority: Signer<'info>,
}

pub fn end_sale(ctx: Context<EndSale>) -> Result<()> {
    ctx.accounts.jellybean_machine.state = JellybeanState::SaleEnded;

    Ok(())
}
