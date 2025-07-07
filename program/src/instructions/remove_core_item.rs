use crate::{
    assert_keys_equal, constants::AUTHORITY_SEED, processors, state::JellybeanMachine,
    JellybeanError,
};
use anchor_lang::prelude::*;
use mpl_core::instructions::{TransferV1CpiBuilder, UpdateCollectionV1CpiBuilder};

/// Remove a Core item from a Jellybean Machine. This can be done before starting a sale or after it has ended.
#[derive(Accounts)]
pub struct RemoveCoreItem<'info> {
    /// Gumball Machine account.
    #[account(
        mut,
        has_one = authority @ JellybeanError::InvalidAuthority,
        constraint = jellybean_machine.can_remove_items() @ JellybeanError::InvalidState,
    )]
    jellybean_machine: Account<'info, JellybeanMachine>,

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

    /// CHECK: Verified in processors
    #[account(mut)]
    asset: Option<UncheckedAccount<'info>>,

    /// Core asset's collection if it's part of one.
    /// CHECK: Verified in processors
    #[account(mut)]
    collection: Option<UncheckedAccount<'info>>,

    /// CHECK: Safe due to address constraint
    #[account(address = mpl_core::ID)]
    mpl_core_program: UncheckedAccount<'info>,

    system_program: Program<'info, System>,
}

pub fn remove_core_item(ctx: Context<RemoveCoreItem>, index: u32) -> Result<()> {
    let authority = &ctx.accounts.authority.to_account_info();
    let mpl_core_program = &ctx.accounts.mpl_core_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let authority_pda = &ctx.accounts.authority_pda.to_account_info();
    let jellybean_machine = &mut ctx.accounts.jellybean_machine;
    let jellybean_machine_info = jellybean_machine.to_account_info();

    let data = jellybean_machine_info.data.borrow();
    let loaded_item = jellybean_machine.get_loaded_item_at_index(&data, index as usize)?;

    require!(
        loaded_item.supply_claimed == loaded_item.supply_redeemed,
        JellybeanError::ItemNotFullyClaimed
    );

    drop(data);

    let collection_info = ctx
        .accounts
        .collection
        .as_ref()
        .map(|account| account.to_account_info());
    let collection = collection_info.as_ref();

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        jellybean_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    if let Some(asset) = &ctx.accounts.asset {
        assert_keys_equal(loaded_item.mint, *asset.key, "Invalid asset")?;

        // Only need to transfer if the asset hasn't been redeemed
        if loaded_item.supply_redeemed == 0 {
            // Transfer the core asset to the authority pda
            TransferV1CpiBuilder::new(mpl_core_program)
                .asset(asset)
                .collection(collection)
                .payer(authority)
                .authority(Some(authority_pda))
                .new_owner(authority)
                .system_program(Some(system_program))
                .invoke_signed(&[&auth_seeds])?;
        }
    } else if let Some(collection) = collection {
        assert_keys_equal(loaded_item.mint, *collection.key, "Invalid collection")?;

        // Update the master edition authority to the authority pda
        UpdateCollectionV1CpiBuilder::new(mpl_core_program)
            .collection(collection)
            .payer(authority)
            .authority(Some(authority_pda))
            .new_update_authority(Some(authority))
            .system_program(system_program)
            .invoke_signed(&[&auth_seeds])?;
    } else {
        return err!(JellybeanError::InvalidAsset);
    };

    // Remove the item from the jellybean machine
    processors::remove_multiple_items_span(jellybean_machine, index, index, authority)?;

    Ok(())
}
