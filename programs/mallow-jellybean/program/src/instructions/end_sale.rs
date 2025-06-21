use anchor_lang::prelude::*;

use crate::{state::JellybeanMachine, GumballError, JellybeanState};

/// Disables minting and allows sales to be settled
#[derive(Accounts)]
pub struct EndSale<'info> {
    /// Gumball machine account.
    #[account(
        mut, 
        has_one = authority,
        constraint = gumball_machine.state != JellybeanState::SaleEnded @ GumballError::InvalidState
    )]
    gumball_machine: Box<Account<'info, JellybeanMachine>>,

    /// Gumball Machine authority. This is the address that controls the upate of the gumball machine.
    #[account(mut)]
    authority: Signer<'info>,
}

pub fn end_sale(ctx: Context<EndSale>) -> Result<()> {
    ctx.accounts.gumball_machine.state = JellybeanState::SaleEnded;

    Ok(())
}
