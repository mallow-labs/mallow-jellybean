use crate::state::{Prize, UnclaimedPrizes};
use crate::JellybeanError;
use anchor_lang::prelude::*;

pub fn claim_item(
    unclaimed_prizes: &mut Box<Account<UnclaimedPrizes>>,
    item_index: u16,
) -> Result<Prize> {
    // Find the position of the prize with the matching item_index
    let position = unclaimed_prizes
        .prizes
        .iter()
        .position(|prize| prize.item_index == item_index)
        .ok_or(JellybeanError::InvalidItemIndex)?;

    // Remove and return the prize
    Ok(unclaimed_prizes.prizes.remove(position))
}
