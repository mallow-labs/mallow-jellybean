use anchor_lang::prelude::*;

use crate::{constants::BASE_JELLYBEAN_MACHINE_SIZE, JellybeanError, JellybeanMachine, LoadedItem};

pub fn add_item(
    jellybean_machine: &mut Account<JellybeanMachine>,
    item: LoadedItem,
    supply: u32,
) -> Result<()> {
    let account_info = jellybean_machine.to_account_info();
    let mut data = account_info.data.borrow_mut();
    let new_item_index = jellybean_machine.items_loaded as usize;

    jellybean_machine.items_loaded = jellybean_machine
        .items_loaded
        .checked_add(1)
        .ok_or(JellybeanError::NumericalOverflowError)?;

    jellybean_machine.supply_loaded = jellybean_machine
        .supply_loaded
        .checked_add(supply as u64)
        .ok_or(JellybeanError::NumericalOverflowError)?;

    let mut position = BASE_JELLYBEAN_MACHINE_SIZE + new_item_index * size_of::<LoadedItem>();

    let mint_slice: &mut [u8] = &mut data[position..position + 32];
    mint_slice.copy_from_slice(&item.mint.to_bytes());
    position += 32;

    let supply_loaded_slice: &mut [u8] = &mut data[position..position + 4];
    supply_loaded_slice.copy_from_slice(&u32::to_le_bytes(supply));
    position += 4;

    let supply_redeemed_slice: &mut [u8] = &mut data[position..position + 4];
    supply_redeemed_slice.copy_from_slice(&u32::to_le_bytes(0));

    Ok(())
}
