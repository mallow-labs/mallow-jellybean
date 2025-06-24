use crate::{state::JellybeanMachine, JellybeanError, JellybeanState};
use anchor_lang::prelude::*;

/// Manually starts a sale.
#[derive(Accounts)]
pub struct StartSale<'info> {
    /// Jellybean machine account.
    #[account(
        mut, 
        constraint = authority.key() == jellybean_machine.authority || authority.key() == jellybean_machine.mint_authority @ JellybeanError::InvalidAuthority,
        constraint = jellybean_machine.state == JellybeanState::None @ JellybeanError::InvalidState,
        constraint = jellybean_machine.items_loaded > 0 @ JellybeanError::JellybeanMachineEmpty
    )]
    jellybean_machine: Box<Account<'info, JellybeanMachine>>,

    /// Jellybean Machine authority. This can be the mint authority or the authority.
    authority: Signer<'info>,
}

pub fn start_sale(ctx: Context<StartSale>) -> Result<()> {
    ctx.accounts.jellybean_machine.state = JellybeanState::SaleLive;

    Ok(())
}
