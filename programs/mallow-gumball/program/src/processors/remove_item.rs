use crate::{
    constants::{CONFIG_LINE_SIZE, GUMBALL_MACHINE_SIZE},
    get_config_count, GumballError, GumballMachine,
};
use anchor_lang::prelude::*;

/// DEPRECATED: Use remove_multiple_items_span instead
pub fn remove_multiple_items(
    gumball_machine: &mut Account<GumballMachine>,
    authority: Pubkey,
    mint: Pubkey,
    expected_seller: Pubkey,
    indices: &[u8],
    amount: u64,
) -> Result<()> {
    require!(!indices.is_empty(), GumballError::InvalidInputLength);

    let account_info = gumball_machine.to_account_info();
    let mut data = account_info.data.borrow_mut();
    let mut count = get_config_count(&data)? as u32;
    let config_line_size = gumball_machine.get_config_line_size();

    // Validate all indices are within bounds and unique
    let mut sorted_indices: Vec<u32> = indices.iter().map(|&x| x as u32).collect();
    sorted_indices.sort_unstable();
    for i in 1..sorted_indices.len() {
        require!(
            sorted_indices[i] != sorted_indices[i - 1],
            GumballError::DuplicateIndex
        );
    }
    require!(
        sorted_indices.last().unwrap() < &(count),
        GumballError::IndexGreaterThanLength
    );

    // Process each removal in reverse order to handle last line movements correctly
    for &index in indices.iter() {
        // Ensure index conversion to usize is safe
        let index_usize = index as usize;
        require!(
            index_usize <= usize::MAX / config_line_size, // Prevent multiplication overflow
            GumballError::NumericalOverflowError
        );

        let config_line_position = GUMBALL_MACHINE_SIZE + 4 + index_usize * config_line_size;

        // Verify seller and authority
        let seller =
            Pubkey::try_from(&data[config_line_position + 32..config_line_position + 64]).unwrap();
        require!(
            authority == gumball_machine.authority || seller == authority,
            GumballError::InvalidAuthority
        );
        require!(expected_seller == seller, GumballError::InvalidSeller);

        // Verify mint
        let item_mint =
            Pubkey::try_from(&data[config_line_position..config_line_position + 32]).unwrap();
        require!(mint == item_mint, GumballError::InvalidMint);

        // Verify amount for version 2+
        if gumball_machine.version >= 2 {
            let item_amount = u64::from_le_bytes(
                data[config_line_position + CONFIG_LINE_SIZE
                    ..config_line_position + CONFIG_LINE_SIZE + 8]
                    .try_into()
                    .unwrap(),
            );
            require!(amount == item_amount, GumballError::InvalidAmount);
        }

        // Find the last non-removed config line
        let mut last_valid_index = count - 1;
        while sorted_indices.binary_search(&(last_valid_index)).is_ok()
            && last_valid_index > index as u32
        {
            last_valid_index -= 1;
        }

        // Ensure last_valid_index conversion to usize is safe
        let last_valid_usize = last_valid_index as usize;
        require!(
            last_valid_usize <= usize::MAX / config_line_size, // Prevent multiplication overflow
            GumballError::NumericalOverflowError
        );

        let last_config_line_position =
            GUMBALL_MACHINE_SIZE + 4 + last_valid_usize * config_line_size;

        // Move data only if we're not removing the last valid line
        if index as u32 != last_valid_index {
            let last_config_slice: Vec<u8> = data
                [last_config_line_position..last_config_line_position + config_line_size]
                .to_vec();
            data[config_line_position..config_line_position + config_line_size]
                .copy_from_slice(&last_config_slice);
        }

        // Zero out the last line
        data[last_config_line_position..last_config_line_position + config_line_size]
            .iter_mut()
            .for_each(|x| *x = 0);

        // Update mint indices
        let indices_start = gumball_machine.get_mint_indices_position()?;
        let index_position = indices_start + (last_valid_index as usize) * 4;
        data[index_position..index_position + 4].copy_from_slice(&u32::MIN.to_le_bytes());

        count = count
            .checked_sub(1)
            .ok_or(GumballError::NumericalOverflowError)?;
    }

    msg!("Items removed: new count={}", count);

    // Update final count
    data[GUMBALL_MACHINE_SIZE..GUMBALL_MACHINE_SIZE + 4]
        .copy_from_slice(&(count as u32).to_le_bytes());

    Ok(())
}

pub fn remove_multiple_items_span(
    gumball_machine: &mut Account<GumballMachine>,
    authority: Pubkey,
    mint: Pubkey,
    expected_seller: Pubkey,
    amount: u64,
    start_index: u32,
    end_index: u32,
) -> Result<()> {
    require!(start_index <= end_index, GumballError::InvalidInputLength);

    let account_info = gumball_machine.to_account_info();
    let mut data = account_info.data.borrow_mut();
    let mut count = get_config_count(&data)? as u32;
    let config_line_size = gumball_machine.get_config_line_size();

    // Validate indices are within bounds
    require!(end_index < count, GumballError::IndexGreaterThanLength);

    // Calculate how many items we're removing
    let items_to_remove = end_index - start_index + 1;
    require!(
        items_to_remove <= count,
        GumballError::NumericalOverflowError
    );

    // First, verify all items in the span
    for index in start_index..=end_index {
        let index_usize = index as usize;
        require!(
            index_usize <= usize::MAX / config_line_size, // Prevent multiplication overflow
            GumballError::NumericalOverflowError
        );

        let config_line_position = GUMBALL_MACHINE_SIZE + 4 + index_usize * config_line_size;

        // Verify seller and authority
        let seller =
            Pubkey::try_from(&data[config_line_position + 32..config_line_position + 64]).unwrap();
        require!(
            authority == gumball_machine.authority || seller == authority,
            GumballError::InvalidAuthority
        );
        require!(expected_seller == seller, GumballError::InvalidSeller);

        // Verify mint
        let item_mint =
            Pubkey::try_from(&data[config_line_position..config_line_position + 32]).unwrap();
        require!(mint == item_mint, GumballError::InvalidMint);

        // Verify amount for version 2+
        if gumball_machine.version >= 2 {
            let item_amount = u64::from_le_bytes(
                data[config_line_position + CONFIG_LINE_SIZE
                    ..config_line_position + CONFIG_LINE_SIZE + 8]
                    .try_into()
                    .unwrap(),
            );
            require!(amount == item_amount, GumballError::InvalidAmount);
        }
    }

    // After verification, perform the actual removal
    if end_index < count - 1 {
        // Only move data if we're not removing the last items in the list
        let items_after_removal = count
            .checked_sub(end_index + 1)
            .ok_or(GumballError::NumericalOverflowError)?;

        if items_after_removal > 0 {
            let source_start =
                GUMBALL_MACHINE_SIZE + 4 + ((end_index + 1) as usize) * config_line_size;
            let dest_start = GUMBALL_MACHINE_SIZE + 4 + (start_index as usize) * config_line_size;
            let copy_size = items_after_removal as usize * config_line_size;

            data.copy_within(source_start..source_start + copy_size, dest_start);
        }
    }

    // Zero out the vacated space at the end
    let zero_start =
        GUMBALL_MACHINE_SIZE + 4 + ((count - items_to_remove) as usize) * config_line_size;
    let zero_size = items_to_remove as usize * config_line_size;
    data[zero_start..zero_start + zero_size]
        .iter_mut()
        .for_each(|x| *x = 0);

    // Zero out the mint indices at the end
    let indices_start = gumball_machine.get_mint_indices_position()?;
    let zero_start = indices_start + ((count - items_to_remove) as usize) * 4;
    let zero_size = items_to_remove as usize * 4;
    data[zero_start..zero_start + zero_size]
        .iter_mut()
        .for_each(|x| *x = 0);

    // Update the count
    count = count
        .checked_sub(items_to_remove)
        .ok_or(GumballError::NumericalOverflowError)?;

    msg!(
        "Items removed: span from {} to {}, new count={}",
        start_index,
        end_index,
        count
    );

    // Update final count
    data[GUMBALL_MACHINE_SIZE..GUMBALL_MACHINE_SIZE + 4]
        .copy_from_slice(&(count as u32).to_le_bytes());

    drop(data);

    Ok(())
}
