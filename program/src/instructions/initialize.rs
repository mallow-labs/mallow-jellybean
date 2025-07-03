use crate::{
    constants::AUTHORITY_SEED, state::JellybeanMachine, utils::validate_settings_args,
    JellybeanState, SettingsArgs
};
use anchor_lang::{prelude::*, Discriminator};

/// Initializes a new jellybean machine.
#[derive(Accounts)]
#[instruction(args: SettingsArgs)]
pub struct Initialize<'info> {
    /// Jellybean machine account.
    ///
    /// CHECK: account constraints checked in account trait
    #[account(
        zero,
        rent_exempt = skip,
        constraint = jellybean_machine.to_account_info().owner == __program_id && jellybean_machine.to_account_info().data_len() >= JellybeanMachine::get_base_size_with_fee_accounts(args.fee_accounts.len())
    )]
    jellybean_machine: UncheckedAccount<'info>,

    /// Gumball Machine authority. This is the address that controls the upate of the jellybean machine.
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

pub fn initialize(ctx: Context<Initialize>, args: SettingsArgs) -> Result<()> {
    let jellybean_machine_account = &mut ctx.accounts.jellybean_machine;

    // Validate settings arguments
    validate_settings_args(&args)?;

    let jellybean_machine = JellybeanMachine {
        version: JellybeanMachine::CURRENT_VERSION,
        authority: ctx.accounts.authority.key(),
        mint_authority: ctx.accounts.authority.key(),
        fee_accounts: args.fee_accounts,
        print_fee_config: args.print_fee_config,
        items_loaded: 0,
        supply_loaded: 0,
        supply_redeemed: 0,
        state: JellybeanState::None,
        uri: args.uri,
        padding: [0; 320],
    };

    let mut struct_data = JellybeanMachine::discriminator().try_to_vec().unwrap();
    struct_data.append(&mut jellybean_machine.try_to_vec().unwrap());

    let mut data = jellybean_machine_account.data.borrow_mut();
    data[0..struct_data.len()].copy_from_slice(&struct_data);

    drop(data);

    Ok(())
}
