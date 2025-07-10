use anchor_lang::prelude::*;

use crate::JellybeanError;

/// Jellybean machine state and config data.
#[account]
#[derive(Debug)]
pub struct UnclaimedPrizes {
    /// Version of the account.
    pub version: u8,
    /// Pubkey of the JellybeanMachine account.
    pub jellybean_machine: Pubkey,
    /// Pubkey of the buyer who drew items
    pub buyer: Pubkey,
    /// Indices of prizes drawn by the buyer
    pub prizes: Vec<Prize>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy)]
pub struct Prize {
    pub item_index: u8,
    pub edition_number: u32,
}

pub const PRIZE_SIZE: usize = 5;

impl UnclaimedPrizes {
    pub const CURRENT_VERSION: u8 = 0;
    pub const SEED_PREFIX: &'static str = "unclaimed_prizes";

    // Base size without the Vec
    pub const BASE_SIZE: usize = 8 // discriminator
        + 1  // version
        + 32 // jellybean_machine
        + 32 // buyer
        + 4; // Vec length prefix

    /// Calculate the space needed for a given number of prize indices
    pub fn space(prize_count: usize) -> usize {
        Self::BASE_SIZE + (prize_count * PRIZE_SIZE)
    }

    pub fn claim_item(&mut self, item_index: u8) -> Result<Prize> {
        let position = self
            .prizes
            .iter()
            .position(|prize| prize.item_index == item_index)
            .ok_or(JellybeanError::InvalidItemIndex)?;
        Ok(self.prizes.remove(position))
    }
}
