use crate::constants::{GUMBALL_MACHINE_SIZE, LOADED_ITEM_SIZE};
use anchor_lang::prelude::*;
use mpl_core::types::Creator;

/// Jellybean machine state and config data.
#[account]
#[derive(Debug)]
pub struct JellybeanMachine {
    /// Version of the account.
    pub version: u8,
    /// Authority address.
    pub authority: Pubkey,
    /// Authority address allowed to mint from the gumball machine.
    pub mint_authority: Pubkey,
    /// Fee splits for proceeds of each draw
    pub fee_splits: [Creator; 5],
    /// Total supply_loaded of all items added.
    pub supply_loaded: u64,
    /// Number of times items have been redeemed.
    pub supply_redeemed: u64,
    /// Number of times items have been settled after being drawn.
    pub supply_settled: u64,
    /// State of the machine.
    pub state: JellybeanState,
    /// Uri of off-chain metadata, max length 196
    pub uri: String,
    /// Padding for future use
    pub padding: [u8; 320],
    // hidden data section to avoid deserialisation:
    // - (LOADED_ITEM_SIZE * items_loaded) - grows as items are loaded
}

impl JellybeanMachine {
    pub const CURRENT_VERSION: u8 = 0;

    /// Gets the size of the gumball machine given the number of items.
    pub fn get_size(item_count: u64) -> usize {
        GUMBALL_MACHINE_SIZE + (LOADED_ITEM_SIZE * item_count as usize) // loaded item lines
    }

    pub fn can_edit_items(&self) -> bool {
        self.supply_redeemed == 0 && self.state == JellybeanState::None
    }

    pub fn can_settle_items(&self) -> bool {
        self.state == JellybeanState::SaleEnded
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct FeeConfig {
    /// Where fees will go
    pub fee_account: Pubkey,
    /// Sale basis points for fees
    pub fee_bps: u16,
}

/// Config line struct for storing asset (NFT) data pre-mint.
#[derive(AnchorSerialize, AnchorDeserialize, Debug)]
pub struct LoadedItem {
    /// Mint account of the asset.
    pub mint: Pubkey,
    /// Total supply when loaded. Edition count for printable NFTs, number of token prizes for fungible assets.
    pub supply_loaded: u64,
    /// Number of times this item has been redeemed.
    pub supply_redeemed: u64,
}

#[derive(Copy, AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum JellybeanState {
    None,      // Initial state
    SaleLive,  // Sale started, can now mint items. Cannot no longer update details or add items.
    SaleEnded, // Sale ended, can now settle items
}
