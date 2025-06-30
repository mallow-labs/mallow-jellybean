use anchor_lang::prelude::*;

pub const MAX_URI_LENGTH: usize = 196;
pub const MAX_FEE_ACCOUNTS: usize = 6;

pub const BASE_JELLYBEAN_MACHINE_SIZE: usize = 8 // discriminator
    + 1                                       // version
    + 32                                      // authority
    + 32                                      // mint authority
    + MAX_FEE_ACCOUNTS * core::mem::size_of::<FeeAccount>()                 // fee splits
    + 2                                       // items loaded
    + 8                                       // supply loaded
    + 8                                       // supply redeemed
    + 8                                       // supply settled
    + 1 // state
    + MAX_URI_LENGTH // uri
    + 320; // padding

pub const LOADED_ITEM_SIZE: usize = core::mem::size_of::<LoadedItem>();

/// Jellybean machine state and config data.
#[account]
#[derive(Debug)]
pub struct JellybeanMachine {
    /// Version of the account.
    pub version: u8,
    /// Authority address.
    pub authority: Pubkey,
    /// Authority address allowed to mint from the jellybean machine.
    pub mint_authority: Pubkey,
    /// Fee accounts for proceeds of each draw
    pub fee_accounts: [Option<FeeAccount>; MAX_FEE_ACCOUNTS],
    /// Total unique items loaded.
    pub items_loaded: u16,
    /// Total supply_loaded of all items added.
    pub supply_loaded: u64,
    /// Number of times items have been redeemed.
    pub supply_redeemed: u64,
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

    /// Gets the size of the jellybean machine given the number of items.
    pub fn get_size(item_count: u64) -> usize {
        BASE_JELLYBEAN_MACHINE_SIZE + (LOADED_ITEM_SIZE * item_count as usize)
    }

    pub fn can_edit_items(&self) -> bool {
        self.supply_redeemed == 0 && self.state == JellybeanState::None
    }

    pub fn can_settle_items(&self) -> bool {
        self.state == JellybeanState::SaleEnded
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct FeeAccount {
    /// Where fees will go
    pub address: Pubkey,
    /// Sale basis points for fees
    pub basis_points: u16,
}

/// Config line struct for storing asset (NFT) data pre-mint.
#[derive(AnchorSerialize, AnchorDeserialize, Debug)]
pub struct LoadedItem {
    /// Mint account of the asset.
    pub mint: Pubkey,
    /// Total supply when loaded. Edition count for printable NFTs, number of token prizes for fungible assets.
    pub supply_loaded: u32,
    /// Number of times this item has been redeemed.
    pub supply_redeemed: u32,
}

/// Common arguments for settings-related operations (initialize and update_settings)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SettingsArgs {
    pub fee_accounts: Vec<Option<FeeAccount>>,
    pub uri: String,
}

#[derive(Copy, AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum JellybeanState {
    None,      // Initial state
    SaleLive,  // Sale started, can now mint items. Cannot no longer update details or add items.
    SaleEnded, // Sale ended, can now settle items
}
