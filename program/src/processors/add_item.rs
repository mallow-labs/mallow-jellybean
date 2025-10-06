use crate::{JellybeanError, JellybeanMachine, LoadedItem, LOADED_ITEM_SIZE, MAX_ITEMS};
use anchor_lang::prelude::*;

pub fn add_item<'info>(
    jellybean_machine: &mut Account<'info, JellybeanMachine>,
    item: LoadedItem,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
) -> Result<()> {
    // Calculate space needed for one more item
    let current_items_loaded = jellybean_machine.items_loaded as usize;
    let new_space = jellybean_machine.get_size((current_items_loaded + 1) as u64);
    let rent = Rent::get()?;
    let new_rent_minimum = rent.minimum_balance(new_space);
    let current_lamports = jellybean_machine.to_account_info().lamports();

    let additional_lamports = new_rent_minimum - current_lamports;

    if additional_lamports > 0 {
        // Transfer additional lamports from payer
        anchor_lang::system_program::transfer(
            anchor_lang::context::CpiContext::new(
                system_program.clone(),
                anchor_lang::system_program::Transfer {
                    from: payer.clone(),
                    to: jellybean_machine.to_account_info(),
                },
            ),
            additional_lamports,
        )?;
    }

    // Reallocate the account
    jellybean_machine
        .to_account_info()
        .realloc(new_space, false)?;

    let account_info = jellybean_machine.to_account_info();
    let mut data = account_info.data.borrow_mut();
    let new_item_index = current_items_loaded;

    require!(
        jellybean_machine.items_loaded < MAX_ITEMS,
        JellybeanError::TooManyItems
    );

    jellybean_machine.items_loaded = jellybean_machine
        .items_loaded
        .checked_add(1)
        .ok_or(JellybeanError::NumericalOverflowError)?;

    jellybean_machine.supply_loaded = jellybean_machine
        .supply_loaded
        .checked_add(item.supply_loaded as u64)
        .ok_or(JellybeanError::NumericalOverflowError)?;

    let position = jellybean_machine.get_loaded_item_position(new_item_index);
    msg!(
        "space: {}, item_index: {}, item_position: {}",
        new_space,
        new_item_index,
        position
    );
    let item_slice: &mut [u8] = &mut data[position..position + LOADED_ITEM_SIZE];
    item_slice.copy_from_slice(&item.try_to_vec()?);

    msg!(
        "Added item: mint={}, new items_loaded={}, new supply_loaded={}",
        item.mint,
        jellybean_machine.items_loaded,
        jellybean_machine.supply_loaded
    );

    Ok(())
}
