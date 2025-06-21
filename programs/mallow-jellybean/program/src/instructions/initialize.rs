use crate::{
    constants::{AUTHORITY_SEED, BASE_JELLYBEAN_MACHINE_SIZE},
    state::JellybeanMachine,
    BuyBackConfig, FeeConfig, JellybeanError, GumballSettings, JellybeanState,
};
use anchor_lang::{prelude::*, Discriminator};
use mpl_token_metadata::MAX_URI_LENGTH;

/// Initializes a new gumball machine.
#[derive(Accounts)]
#[instruction(settings: GumballSettings)]
pub struct Initialize<'info> {
    /// Gumball Machine account. The account space must be allocated to allow accounts larger
    /// than 10kb.
    ///
    /// CHECK: account constraints checked in account trait
    #[account(
        zero,
        rent_exempt = skip,
        constraint = jellybean_machine.to_account_info().owner == __program_id && jellybean_machine.to_account_info().data_len() >= JellybeanMachine::get_size(settings.item_capacity, JellybeanMachine::CURRENT_VERSION)
    )]
    jellybean_machine: UncheckedAccount<'info>,

    /// Gumball Machine authority. This is the address that controls the upate of the gumball machine.
    ///
    /// CHECK: authority can be any account and is not written to or read
    authority: UncheckedAccount<'info>,

    /// CHECK: Safe due to seeds constraint
    #[account(
        init,
        payer = payer,
        space = 0,
        seeds = [
            AUTHORITY_SEED.as_bytes(), 
            jellybean_machine.key().as_ref()
        ],
        bump
    )]
    authority_pda: UncheckedAccount<'info>,

    /// Payer of the transaction.
    #[account(mut)]
    payer: Signer<'info>,

    system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeArgs {
    settings: GumballSettings,
    fee_config: Option<FeeConfig>,
    disable_primary_split: bool,
    buy_back_config: Option<BuyBackConfig>,
    disable_royalties: bool,
}

pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    let gumball_machine_account = &mut ctx.accounts.jellybean_machine;

    let InitializeArgs {
        settings,
        fee_config,
        disable_primary_split,
        buy_back_config,
        disable_royalties,
    } = args;

    if settings.uri.len() >= MAX_URI_LENGTH - 4 {
        return err!(JellybeanError::UriTooLong);
    }

    // Details are considered finalized once sellers are invited
    let state = if settings.sellers_merkle_root.is_some() {
        JellybeanState::DetailsFinalized
    } else {
        JellybeanState::None
    };

    let jellybean_machine = JellybeanMachine {
        version: JellybeanMachine::CURRENT_VERSION,
        authority: ctx.accounts.authority.key(),
        mint_authority: ctx.accounts.authority.key(),
        marketplace_fee_config: fee_config,
        items_redeemed: 0,
        items_settled: 0,
        total_revenue: 0,
        state,
        settings,
    };

    let mut struct_data = JellybeanMachine::discriminator().try_to_vec().unwrap();
    struct_data.append(&mut jellybean_machine.try_to_vec().unwrap());

    let mut account_data = gumball_machine_account.data.borrow_mut();
    account_data[0..struct_data.len()].copy_from_slice(&struct_data);
    // set the initial number of config lines
    account_data[BASE_JELLYBEAN_MACHINE_SIZE..BASE_JELLYBEAN_MACHINE_SIZE + 4]
        .copy_from_slice(&u32::MIN.to_le_bytes());

    let disable_primary_split_position = jellybean_machine.get_disable_primary_split_position()?;
    account_data[disable_primary_split_position] = if disable_primary_split { 1 } else { 0 };

    let disable_royalties_position = jellybean_machine.get_disable_royalties_position()?;
    account_data[disable_royalties_position] = if disable_royalties { 1 } else { 0 };

    let buy_back_config_position = jellybean_machine.get_buy_back_config_position()?;
    let final_buy_back_config = if let Some(buy_back_config) = buy_back_config {
        buy_back_config
    } else {
        BuyBackConfig::default()
    };
    account_data[buy_back_config_position..buy_back_config_position + BuyBackConfig::INIT_SPACE]
        .copy_from_slice(&final_buy_back_config.try_to_vec().unwrap());

    let buy_back_funds_available_position =
        jellybean_machine.get_buy_back_funds_available_position()?;
    account_data[buy_back_funds_available_position..buy_back_funds_available_position + 8]
        .copy_from_slice(&u64::MIN.to_le_bytes());

    Ok(())
}
