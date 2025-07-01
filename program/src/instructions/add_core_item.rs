use crate::{constants::AUTHORITY_SEED, state::JellybeanMachine, JellybeanError, LoadedItem};
use anchor_lang::prelude::*;
use mpl_core::{
    instructions::{TransferV1CpiBuilder, UpdateCollectionV1CpiBuilder},
    Collection,
};

/// Add core asset to a jellybean machine.
#[derive(Accounts)]
pub struct AddCoreItem<'info> {
    /// Gumball Machine account.
    #[account(
        mut,
        has_one = authority @ JellybeanError::InvalidAuthority,
        constraint = jellybean_machine.can_add_items() @ JellybeanError::InvalidState,
    )]
    jellybean_machine: Box<Account<'info, JellybeanMachine>>,

    /// CHECK: Safe due to seeds constraint
    #[account(
        mut,
        seeds = [
            AUTHORITY_SEED.as_bytes(), 
            jellybean_machine.key().as_ref()
        ],
        bump
    )]
    authority_pda: UncheckedAccount<'info>,

    /// Authority of the jellybean machine.
    #[account(mut)]
    authority: Signer<'info>,

    /// Payer for account reallocation
    #[account(mut)]
    payer: Signer<'info>,

    /// CHECK: Safe due to freeze
    #[account(mut)]
    asset: Option<UncheckedAccount<'info>>,

    /// Core asset's collection if it's part of one.
    /// CHECK: Verified in mpl_core processors
    #[account(mut)]
    collection: Option<UncheckedAccount<'info>>,

    /// CHECK: Safe due to address constraint
    #[account(address = mpl_core::ID)]
    mpl_core_program: UncheckedAccount<'info>,

    system_program: Program<'info, System>,
}

pub fn add_core_item(ctx: Context<AddCoreItem>) -> Result<()> {
    let authority = &ctx.accounts.authority.to_account_info();
    let authority_pda = &ctx.accounts.authority_pda.to_account_info();
    let mpl_core_program = &ctx.accounts.mpl_core_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let payer = &ctx.accounts.payer.to_account_info();
    let jellybean_machine = &mut ctx.accounts.jellybean_machine;

    let collection_info = ctx
        .accounts
        .collection
        .as_ref()
        .map(|account| account.to_account_info());
    let collection = collection_info.as_ref();

    let loaded_item = if let Some(asset) = &ctx.accounts.asset {
        // Transfer the core asset to the authority pda
        TransferV1CpiBuilder::new(mpl_core_program)
            .asset(asset)
            .collection(collection)
            .payer(authority)
            .new_owner(authority_pda)
            .system_program(Some(system_program))
            .invoke()?;

        LoadedItem {
            mint: asset.key(),
            supply_loaded: 1,
            supply_redeemed: 0,
            supply_claimed: 0,
        }
    } else if let Some(collection_account) = &ctx.accounts.collection {
        let collection_info = collection_account.to_account_info();
        let collection = Box::<Collection>::try_from(&collection_info)?;

        require!(
            collection.base.current_size == 0,
            JellybeanError::MasterEditionNotEmpty
        );

        if let Some(master_edition) = collection.plugin_list.master_edition {
            if let Some(max_supply) = master_edition.master_edition.max_supply {
                // Update the master edition authority to the authority pda
                UpdateCollectionV1CpiBuilder::new(mpl_core_program)
                    .collection(collection_account)
                    .payer(authority)
                    .new_update_authority(Some(authority_pda))
                    .system_program(system_program)
                    .invoke()?;

                LoadedItem {
                    mint: collection_account.key(),
                    supply_loaded: max_supply,
                    supply_redeemed: collection.base.current_size,
                    supply_claimed: 0,
                }
            } else {
                return err!(JellybeanError::InvalidMasterEditionSupply);
            }
        } else {
            return err!(JellybeanError::MissingMasterEdition);
        }
    } else {
        return err!(JellybeanError::InvalidAsset);
    };

    crate::processors::add_item(jellybean_machine, loaded_item, payer, system_program)?;

    Ok(())
}
