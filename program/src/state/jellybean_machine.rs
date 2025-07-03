use anchor_lang::prelude::{
    borsh::{BorshDeserialize, BorshSerialize},
    *,
};

pub const MAX_URI_LENGTH: usize = 196;
pub const MAX_FEE_ACCOUNTS: usize = 6;

const BASE_JELLYBEAN_MACHINE_SIZE: usize = 8 // discriminator
    + 1                                       // version
    + 32                                      // authority
    + 32                                      // mint authority
    + 4                                       // fee account vec size
    + 41                                      // print fee config
    + 2                                       // items loaded
    + 8                                       // supply loaded
    + 8                                       // supply redeemed
    + 8                                       // supply settled
    + 1 // state
    + MAX_URI_LENGTH // uri
    + 320; // padding

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
    pub fee_accounts: Vec<FeeAccount>,
    /// Print fee config
    pub print_fee_config: Option<PrintFeeConfig>,
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

    pub fn get_base_size(&self) -> usize {
        Self::get_base_size_with_fee_accounts(self.fee_accounts.len())
    }

    pub fn get_base_size_with_fee_accounts(fee_accounts_len: usize) -> usize {
        BASE_JELLYBEAN_MACHINE_SIZE + fee_accounts_len * 34
    }

    pub fn get_loaded_item_position(&self, index: usize) -> usize {
        self.get_base_size() + index * LOADED_ITEM_SIZE
    }

    /// Gets the size of the jellybean machine given the number of items.
    pub fn get_size(&self, item_count: u64) -> usize {
        Self::get_size_with_fee_accounts(self.fee_accounts.len(), item_count)
    }

    /// Gets the size of the jellybean machine given the number of items.
    pub fn get_size_with_fee_accounts(fee_accounts_len: usize, item_count: u64) -> usize {
        Self::get_base_size_with_fee_accounts(fee_accounts_len)
            + (LOADED_ITEM_SIZE * item_count as usize)
    }

    pub fn can_add_items(&self) -> bool {
        self.state == JellybeanState::None
    }

    pub fn can_remove_items(&self) -> bool {
        self.state == JellybeanState::None || self.state == JellybeanState::SaleEnded
    }

    pub fn get_loaded_item_at_index(
        &self,
        account_data: &[u8],
        index: usize,
    ) -> Result<LoadedItem> {
        let item_position = self.get_loaded_item_position(index);
        let item_data = &mut &account_data[item_position..item_position + LOADED_ITEM_SIZE];
        return Ok(LoadedItem::deserialize(item_data)?);
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct FeeAccount {
    /// Where fees will go
    pub address: Pubkey,
    /// Sale basis points for fees
    pub basis_points: u16,
}

pub const LOADED_ITEM_SIZE: usize = 32 + // mint
    4 + // supply_loaded
    4 + // supply_redeemed
    4 + // supply_claimed
    8; // escrow_amount

/// Config line struct for storing asset (NFT) data pre-mint.
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct LoadedItem {
    /// Mint account of the asset.
    pub mint: Pubkey,
    /// Total supply when loaded. Edition count for printable NFTs, number of token prizes for fungible assets.
    pub supply_loaded: u32,
    /// Number of times this item has been redeemed.
    pub supply_redeemed: u32,
    /// Number of redeemed items that have been claimed.
    pub supply_claimed: u32,
    /// Escrow amount for the item (for edition prints)
    pub escrow_amount: u64,
}

/// Common arguments for settings-related operations (initialize and update_settings)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SettingsArgs {
    pub uri: String,
    pub fee_accounts: Vec<FeeAccount>,
    pub print_fee_config: Option<PrintFeeConfig>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PrintFeeConfig {
    pub address: Pubkey,
    pub amount: u64,
}

#[derive(Copy, AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum JellybeanState {
    None,      // Initial state
    SaleLive,  // Sale started, can now mint items. Cannot no longer update details or add items.
    SaleEnded, // Sale ended, can now settle items
}
