use anchor_lang::prelude::*;

use crate::{
    constants::GUMBALL_MACHINE_SIZE, get_bit_byte_info, get_config_count, ConfigLineV2Input,
    GumballError, GumballMachine, GumballState, TokenStandard,
};

pub fn add_item(
    gumball_machine: &mut Account<GumballMachine>,
    config_line: ConfigLineV2Input,
    token_standard: TokenStandard,
    quantity: u16,
    // Populate to indicate re-adding an item
    re_add_index: Option<u32>,
) -> Result<()> {
    let is_re_add = re_add_index.is_some();
    if is_re_add {
        require!(gumball_machine.version >= 5, GumballError::InvalidVersion);
    }

    if gumball_machine.state == GumballState::SaleLive {
        require!(is_re_add, GumballError::MissingItemIndex);
    }

    let account_info = gumball_machine.to_account_info();
    // mutable reference to the account data (config lines are written in the
    // 'hidden' section of the data array)
    let mut data = account_info.data.borrow_mut();

    // holds the total number of config lines
    let mut config_count = get_config_count(&data)?;
    let index = if let Some(index) = re_add_index {
        index
    } else {
        config_count as u32
    };

    // no risk overflow because you literally cannot store this many in an account
    // going beyond u32 only happens with the hidden settings candies
    let total = index
        .checked_add(quantity.into())
        .ok_or(GumballError::NumericalOverflowError)?;

    if total > (gumball_machine.settings.item_capacity as u32) {
        return err!(GumballError::IndexGreaterThanLength);
    }

    let mut position =
        GUMBALL_MACHINE_SIZE + 4 + (index as usize) * gumball_machine.get_config_line_size();

    // (unordered) indices for the mint
    let indices_start = gumball_machine.get_mint_indices_position()?;
    let claimed_items_bit_mask_start = gumball_machine.get_claimed_items_bit_mask_position();
    let settled_items_bit_mask_start = gumball_machine.get_settled_items_bit_mask_position()?;

    for i in 0..quantity {
        let mint_slice: &mut [u8] = &mut data[position..position + 32];
        mint_slice.copy_from_slice(&config_line.mint.to_bytes());
        position += 32;

        let seller_slice: &mut [u8] = &mut data[position..position + 32];
        seller_slice.copy_from_slice(&config_line.seller.to_bytes());

        if is_re_add {
            position += 32;
            // Zero out buyer
            let buyer_slice: &mut [u8] = &mut data[position..position + 32];
            buyer_slice.copy_from_slice(&[0; 32]);
            position += 32;
        } else {
            // Skip buyer (+32)
            position += 64;
        }

        let token_standard_slice: &mut [u8] = &mut data[position..position + 1];
        token_standard_slice.copy_from_slice(&u8::to_be_bytes(token_standard as u8));
        position += 1;

        if gumball_machine.version >= 2 {
            let amount_slice: &mut [u8] = &mut data[position..position + 8];
            amount_slice.copy_from_slice(&u64::to_le_bytes(config_line.amount));
            position += 8;
        }

        // add the new index to the mint indices vec
        let item_index = index + i as u32;

        let index_position = if is_re_add {
            // Mint indices will be as long as config count - redeemed items and we need to add to the end
            indices_start
                + ((config_count - (gumball_machine.items_redeemed as usize) + (i as usize)) * 4)
        } else {
            indices_start + (item_index as usize) * 4
        };

        data[index_position..index_position + 4].copy_from_slice(&u32::to_le_bytes(item_index));

        // Make sure item is claimed and settled, and reset to false
        if is_re_add {
            let (byte_position, _, mask) =
                get_bit_byte_info(claimed_items_bit_mask_start, item_index as usize)?;
            let current_value = data[byte_position];
            let is_claimed = current_value & mask == mask;
            require!(is_claimed, GumballError::ItemNotClaimed);
            // Reset to false
            data[byte_position] = current_value & !mask;

            let (byte_position, _, mask) =
                get_bit_byte_info(settled_items_bit_mask_start, item_index as usize)?;
            let current_value = data[byte_position];
            let is_settled = current_value & mask == mask;
            require!(is_settled, GumballError::ItemNotSettled);
            // Reset to false
            data[byte_position] = current_value & !mask;
        }
    }

    if is_re_add {
        gumball_machine.items_redeemed = gumball_machine
            .items_redeemed
            .checked_sub(quantity.into())
            .ok_or(GumballError::NumericalOverflowError)?;

        gumball_machine.items_settled = gumball_machine
            .items_settled
            .checked_sub(quantity.into())
            .ok_or(GumballError::NumericalOverflowError)?;
    } else {
        config_count = config_count
            .checked_add(quantity.into())
            .ok_or(GumballError::NumericalOverflowError)?;

        msg!(
            "New item added: position={}, new count={})",
            position,
            config_count,
        );

        // updates the config lines count
        data[GUMBALL_MACHINE_SIZE..GUMBALL_MACHINE_SIZE + 4]
            .copy_from_slice(&(config_count as u32).to_le_bytes());
    }

    Ok(())
}
