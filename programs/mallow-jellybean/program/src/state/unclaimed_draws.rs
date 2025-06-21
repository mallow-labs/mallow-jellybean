use anchor_lang::prelude::*;

/// Jellybean machine state and config data.
#[account]
#[derive(Debug)]
pub struct UnclaimedDraws {
    /// Version of the account.
    pub version: u8,
    /// Pubkey of the JellybeanMachine account.
    pub jellybean_machine: Pubkey,
    /// Pubkey of the user who drew items
    pub user: Pubkey,
    // hidden data section to avoid deserialisation:
    // prize_indices - (u32 * number drawn) - grows as items are drawn, shrinks as items are claimed
}
