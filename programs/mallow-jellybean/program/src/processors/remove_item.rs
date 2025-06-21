use crate::{constants::BASE_JELLYBEAN_MACHINE_SIZE, JellybeanError, JellybeanMachine, LoadedItem};
use anchor_lang::prelude::*;

pub fn remove_multiple_items_span<'info>(
    jellybean_machine: &mut Account<'info, JellybeanMachine>,
    start_index: u32,
    end_index: u32,
    authority: &AccountInfo<'info>,
) -> Result<()> {
    if start_index > end_index {
        return err!(JellybeanError::InvalidInputLength);
    }

    let account_info = jellybean_machine.to_account_info();
    let mut data = account_info.data.borrow_mut();
    let items_loaded = jellybean_machine.items_loaded;

    // Validate indices are within bounds
    if end_index >= items_loaded as u32 {
        return err!(JellybeanError::IndexGreaterThanLength);
    }

    // Calculate how many items we're removing
    let items_to_remove = end_index - start_index + 1;

    // Calculate the total supply being removed for verification
    let mut total_supply_removed = 0u64;
    for index in start_index..=end_index {
        let item_position =
            BASE_JELLYBEAN_MACHINE_SIZE + (index as usize) * size_of::<LoadedItem>();
        let item_data = &data[item_position..item_position + size_of::<LoadedItem>()];
        let item = LoadedItem::try_from_slice(item_data)?;
        total_supply_removed = total_supply_removed
            .checked_add(item.supply_loaded as u64)
            .ok_or(JellybeanError::NumericalOverflowError)?;
    }

    // Update the jellybean machine counters (reverse of add_item logic)
    jellybean_machine.items_loaded = jellybean_machine
        .items_loaded
        .checked_sub(items_to_remove as u16)
        .ok_or(JellybeanError::NumericalOverflowError)?;

    jellybean_machine.supply_loaded = jellybean_machine
        .supply_loaded
        .checked_sub(total_supply_removed)
        .ok_or(JellybeanError::NumericalOverflowError)?;

    // Move remaining items to fill the gap if we're not removing from the end
    if end_index < (items_loaded - 1) as u32 {
        let items_after_removal = items_loaded as u32 - end_index - 1;

        if items_after_removal > 0 {
            let source_start =
                BASE_JELLYBEAN_MACHINE_SIZE + ((end_index + 1) as usize) * size_of::<LoadedItem>();
            let dest_start =
                BASE_JELLYBEAN_MACHINE_SIZE + (start_index as usize) * size_of::<LoadedItem>();
            let copy_size = (items_after_removal as usize) * size_of::<LoadedItem>();

            data.copy_within(source_start..source_start + copy_size, dest_start);
        }
    }

    // Zero out the vacated space at the end
    let zero_start = BASE_JELLYBEAN_MACHINE_SIZE
        + (jellybean_machine.items_loaded as usize) * size_of::<LoadedItem>();
    let zero_size = (items_to_remove as usize) * size_of::<LoadedItem>();
    data[zero_start..zero_start + zero_size]
        .iter_mut()
        .for_each(|x| *x = 0);

    drop(data);

    // Calculate new space needed and reallocate if smaller
    let new_space = JellybeanMachine::get_size(jellybean_machine.items_loaded as u64);
    let current_space = jellybean_machine.to_account_info().data_len();

    if new_space < current_space {
        let rent = Rent::get()?;
        let new_rent_minimum = rent.minimum_balance(new_space);
        let current_lamports = jellybean_machine.to_account_info().lamports();

        // Reallocate to smaller size
        jellybean_machine
            .to_account_info()
            .realloc(new_space, false)?;

        // Refund excess rent to authority
        if current_lamports > new_rent_minimum {
            let excess_lamports = current_lamports - new_rent_minimum;

            // Transfer excess lamports to authority
            **jellybean_machine
                .to_account_info()
                .try_borrow_mut_lamports()? -= excess_lamports;
            **authority.try_borrow_mut_lamports()? += excess_lamports;
        }
    }

    msg!(
        "Items removed: span from {} to {}, new items_loaded={}, new supply_loaded={}",
        start_index,
        end_index,
        jellybean_machine.items_loaded,
        jellybean_machine.supply_loaded
    );

    Ok(())
}
