use anchor_lang::prelude::*;

use crate::{get_config_count, state::JellybeanMachine, JellybeanError, JellybeanState};

/// Manually starts a sale.
#[derive(Accounts)]
pub struct StartSale<'info> {
    /// Gumball machine account.
    #[account(
        mut, 
        constraint = authority.key() == jellybean_machine.authority || authority.key() == jellybean_machine.mint_authority @ JellybeanError::InvalidAuthority,
        constraint = jellybean_machine.state != JellybeanState::SaleLive && jellybean_machine.state != JellybeanState::SaleEnded @ JellybeanError::InvalidState
    )]
    jellybean_machine: Box<Account<'info, JellybeanMachine>>,

    /// Gumball Machine authority. This can be the mint authority or the authority.
    authority: Signer<'info>,
}

pub fn start_sale(ctx: Context<StartSale>) -> Result<()> {
    let jellybean_machine = &mut ctx.accounts.jellybean_machine;
    let account_info = jellybean_machine.to_account_info();
    let data = account_info.data.borrow_mut();
    let count = get_config_count(&data)?;

    require!(count > 0, JellybeanError::JellybeanMachineEmpty);

    jellybean_machine.state = JellybeanState::SaleLive;

    Ok(())
}
