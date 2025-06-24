use anchor_lang::prelude::*;

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
    pub item_index: u16,
    pub edition_number: u32,
}

impl UnclaimedPrizes {
    pub const CURRENT_VERSION: u8 = 0;
    pub const SEED_PREFIX: &'static str = "unclaimed_prizes";

    // Base size without the Vec
    pub const BASE_SIZE: usize = 8 // discriminator
        + 1  // version
        + 32 // jellybean_machine
        + 32 // buyer
        + 4; // Vec length prefix

    // Initial size for empty Vec
    pub const INIT_SIZE: usize = Self::BASE_SIZE;

    /// Calculate the space needed for a given number of prize indices
    pub fn space(prize_count: usize) -> usize {
        Self::BASE_SIZE + (prize_count * core::mem::size_of::<Prize>())
    }

    /// Get the current space requirement for this account
    pub fn current_space(&self) -> usize {
        Self::space(self.prizes.len())
    }

    /// Get the space needed to add one more prize
    pub fn space_for_next_prize(&self) -> usize {
        Self::space(self.prizes.len() + 1)
    }
}
