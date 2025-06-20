use anchor_lang::prelude::*;

use crate::{
    get_config_count, state::GumballMachine, BuyBackConfig, GumballError, GumballSettings,
    GumballState,
};

/// Initializes a new gumball machine.
#[derive(Accounts)]
pub struct UpdateSettings<'info> {
    /// Gumball machine account.
    #[account(
        mut, 
        has_one = authority
    )]
    gumball_machine: Box<Account<'info, GumballMachine>>,

    /// Gumball Machine authority. This is the address that controls the upate of the gumball machine.
    #[account(mut)]
    authority: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct UpdateArgs {
    pub settings: GumballSettings,
    pub buy_back_config: Option<BuyBackConfig>,
}

pub fn update_settings(ctx: Context<UpdateSettings>, args: UpdateArgs) -> Result<()> {
    let UpdateArgs {
        settings,
        buy_back_config,
    } = args;

    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let account_info = gumball_machine.to_account_info();
    let mut account_data = account_info.data.borrow_mut();
    let items_loaded = get_config_count(&account_data)? as u64;

    // uri and sellers_merkle_root can always be changed

    // TODO: Allow decreasing capacity
    if settings.item_capacity != gumball_machine.settings.item_capacity {
        msg!("Cannot update item capacity");
        return err!(GumballError::InvalidSettingUpdate);
    }

    if gumball_machine.items_redeemed > 0 {
        require!(buy_back_config.is_none(), GumballError::InvalidState);
    } else if gumball_machine.version >= 5 {
        if let Some(buy_back_config) = buy_back_config {
            let buy_back_config_position = gumball_machine.get_buy_back_config_position()?;
            msg!("buy_back_config_position: {}", buy_back_config_position);

            account_data
                [buy_back_config_position..buy_back_config_position + BuyBackConfig::INIT_SPACE]
                .copy_from_slice(&buy_back_config.try_to_vec().unwrap());
        }
    }

    // Limit the possible updates when details are finalized or there are already items loaded
    if gumball_machine.state != GumballState::None || items_loaded > 0 {
        // Can only increase items_per_seller
        if settings.items_per_seller < gumball_machine.settings.items_per_seller {
            msg!("Cannot decrease items_per_seller");
            return err!(GumballError::InvalidSettingUpdate);
        }
        // Can only decrease curator fee bps
        if settings.curator_fee_bps > gumball_machine.settings.curator_fee_bps {
            msg!("Cannot increase curator_fee_bps");
            return err!(GumballError::InvalidSettingUpdate);
        }

        // Cannot change hide_sold_items if others have been invited
        if gumball_machine.settings.sellers_merkle_root.is_some()
            && settings.hide_sold_items != gumball_machine.settings.hide_sold_items
        {
            msg!("Cannot change hide_sold_items");
            return err!(GumballError::InvalidSettingUpdate);
        }
    }

    gumball_machine.settings = settings.clone();

    // Details are considered finalized once sellers are invited
    if settings.sellers_merkle_root.is_some() {
        gumball_machine.state = GumballState::DetailsFinalized;
    }

    Ok(())
}
