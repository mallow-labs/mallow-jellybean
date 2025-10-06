use crate::{JellybeanError, JellybeanMachine, LOADED_ITEM_SIZE};
use anchor_lang::prelude::*;
use arrayref::array_ref;

pub fn remove_multiple_items_span<'info>(
    jellybean_machine: &mut Account<'info, JellybeanMachine>,
    start_index: u8,
    end_index: u8,
    authority: &AccountInfo<'info>,
) -> Result<()> {
    if start_index > end_index {
        return err!(JellybeanError::InvalidInputLength);
    }

    let account_info = jellybean_machine.to_account_info();
    let mut data = account_info.data.borrow_mut();
    let items_loaded = jellybean_machine.items_loaded;

    // Validate indices are within bounds
    if end_index >= items_loaded {
        return err!(JellybeanError::IndexGreaterThanLength);
    }

    // Calculate how many items we're removing
    let items_to_remove = end_index - start_index + 1;

    // Calculate the total supply being removed for verification
    let mut total_supply_removed = 0u64;
    for index in start_index..=end_index {
        let item_position = jellybean_machine.get_loaded_item_position(index as usize);
        // Skip mint field (32 bytes) and read supply_loaded field (4 bytes)
        let supply_loaded_position = item_position + 32;
        let supply_loaded = u32::from_le_bytes(*array_ref![data, supply_loaded_position, 4]);
        total_supply_removed = total_supply_removed
            .checked_add(supply_loaded as u64)
            .ok_or(JellybeanError::NumericalOverflowError)?;
    }

    // Update the jellybean machine counters (reverse of add_item logic)
    jellybean_machine.items_loaded = jellybean_machine
        .items_loaded
        .checked_sub(items_to_remove)
        .ok_or(JellybeanError::NumericalOverflowError)?;

    jellybean_machine.supply_loaded = jellybean_machine
        .supply_loaded
        .checked_sub(total_supply_removed)
        .ok_or(JellybeanError::NumericalOverflowError)?;

    // Move remaining items to fill the gap if we're not removing from the end
    if end_index < (items_loaded - 1) {
        let items_after_removal = items_loaded - end_index - 1;

        if items_after_removal > 0 {
            let source_start = jellybean_machine.get_loaded_item_position((end_index + 1) as usize);
            let dest_start = jellybean_machine.get_loaded_item_position(start_index as usize);
            let copy_size = (items_after_removal as usize) * LOADED_ITEM_SIZE;

            data.copy_within(source_start..source_start + copy_size, dest_start);
        }
    }

    drop(data);

    // Calculate new space needed and reallocate if smaller
    let new_space = jellybean_machine.get_size(jellybean_machine.items_loaded as u64);
    let rent = Rent::get()?;
    let new_rent_minimum = rent.minimum_balance(new_space);
    let current_lamports = jellybean_machine.to_account_info().lamports();

    // Reallocate to smaller size
    jellybean_machine
        .to_account_info()
        .realloc(new_space, false)?;

    // Refund excess rent to authority
    let excess_lamports = current_lamports
        .checked_sub(new_rent_minimum)
        .ok_or(JellybeanError::NumericalOverflowError)?;

    // Transfer excess lamports to authority
    **jellybean_machine
        .to_account_info()
        .try_borrow_mut_lamports()? -= excess_lamports;
    **authority.try_borrow_mut_lamports()? += excess_lamports;

    msg!(
        "Items removed: span from {} to {}, new items_loaded={}, new supply_loaded={}",
        start_index,
        end_index,
        jellybean_machine.items_loaded,
        jellybean_machine.supply_loaded
    );

    Ok(())
}
