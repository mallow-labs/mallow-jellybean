use anchor_lang::prelude::*;

use crate::{
    constants::{CONFIG_LINE_SIZE, CONFIG_LINE_V2_SIZE, GUMBALL_MACHINE_SIZE},
    GumballError,
};

/// Gumball machine state and config data.
#[account]
#[derive(Debug)]
pub struct GumballMachine {
    /// Version of the account.
    pub version: u8,
    /// Authority address.
    pub authority: Pubkey,
    /// Authority address allowed to mint from the gumball machine.
    pub mint_authority: Pubkey,
    /// Fee config for the marketplace this gumball is listed on
    pub marketplace_fee_config: Option<FeeConfig>,
    /// Number of assets redeemed.
    pub items_redeemed: u64,
    /// Number of assets settled after sale.
    pub items_settled: u64,
    /// Amount of lamports/tokens received from purchases.
    pub total_revenue: u64,
    /// True if the authority has finalized details, which prevents adding more nfts.
    pub state: GumballState,
    /// User-defined settings
    pub settings: GumballSettings,
    // hidden data section to avoid deserialisation:
    //
    // - (u32) how many actual lines of data there are currently (eventually
    //   equals item_capacity)
    // - (CONFIG_LINE_SIZE * item_capacity)
    // - (item_capacity / 8) + 1 bit mask to keep track of which items have been claimed
    // - (item_capacity / 8) + 1 bit mask to keep track of which items have been settled
    // - (u32 * item_capacity) mint indices
    //
    // - version 3:
    // - (boolean) disable_royalties
    // - ([u8; 3]) unused
    // - (boolean) disable_primary_split
    //
    // - version 4:
    // - (BuyBackConfig) buy_back_config
    // - (u64) buy_back_funds_available
    //
    // - version 5:
    // - (u64) total_proceeds_settled
}

impl GumballMachine {
    pub const CURRENT_VERSION: u8 = 5;

    /// Gets the size of the gumball machine given the number of items.
    pub fn get_size(item_count: u64, version: u8) -> usize {
        GUMBALL_MACHINE_SIZE
            + 4 // number of items inserted
            + ((if version >= 2 { CONFIG_LINE_V2_SIZE } else { CONFIG_LINE_SIZE }) * item_count as usize) // config lines
            + (item_count as usize / 8) + 1 // bit mask tracking claimed items
            + (item_count as usize / 8) + 1 // bit mask tracking settled items
            + 4 + (4 * item_count as usize) // mint indices
            + if version >= 3 { 1 } else { 0 } // disable_primary_split
            + if version >= 4 { BuyBackConfig::INIT_SPACE + 8 } else { 0 } // buy_back_config
            + if version >= 5 { 8 } else { 0 } // total_proceeds_settled
    }

    pub fn get_config_line_size(&self) -> usize {
        if self.version < 2 {
            CONFIG_LINE_SIZE
        } else {
            CONFIG_LINE_V2_SIZE
        }
    }

    pub fn get_claimed_items_bit_mask_position(&self) -> usize {
        GUMBALL_MACHINE_SIZE
            + 4
            + (self.settings.item_capacity as usize) * self.get_config_line_size()
    }

    pub fn get_settled_items_bit_mask_position(&self) -> Result<usize> {
        let mask_size = (self.settings.item_capacity)
            .checked_div(8)
            .ok_or(GumballError::NumericalOverflowError)? as usize;
        let position = self.get_claimed_items_bit_mask_position() + mask_size + 1;
        Ok(position)
    }

    pub fn get_mint_indices_position(&self) -> Result<usize> {
        let mask_size = (self.settings.item_capacity)
            .checked_div(8)
            .ok_or(GumballError::NumericalOverflowError)? as usize;
        let position = self.get_settled_items_bit_mask_position()? + mask_size + 1;
        Ok(position)
    }

    pub fn get_disable_royalties_position(&self) -> Result<usize> {
        let position =
            self.get_mint_indices_position()? + (4 * self.settings.item_capacity as usize);
        Ok(position)
    }

    pub fn get_disable_primary_split_position(&self) -> Result<usize> {
        // NOTE: +1 for disable royalties bool, + 3 unused bytes and can be used for future purposes
        let position = self.get_disable_royalties_position()? + 4;
        Ok(position)
    }

    pub fn get_buy_back_config_position(&self) -> Result<usize> {
        let position = self.get_disable_primary_split_position()? + 1;
        Ok(position)
    }

    pub fn get_buy_back_config(&self, data: &[u8]) -> Result<BuyBackConfig> {
        if self.version < 4 {
            return Ok(BuyBackConfig::default());
        }
        let position = self.get_buy_back_config_position()?;

        let buy_back_config =
            BuyBackConfig::try_from_slice(&data[position..position + BuyBackConfig::INIT_SPACE])?;
        Ok(buy_back_config)
    }

    pub fn get_buy_back_funds_available_position(&self) -> Result<usize> {
        let position = self.get_buy_back_config_position()? + BuyBackConfig::INIT_SPACE;
        Ok(position)
    }

    pub fn get_buy_back_funds_available(&self, data: &[u8]) -> Result<u64> {
        let position = self.get_buy_back_funds_available_position()?;
        Ok(u64::from_le_bytes(
            data[position..position + 8].try_into().unwrap(),
        ))
    }

    pub fn get_total_proceeds_settled_position(&self) -> Result<usize> {
        let position = self.get_buy_back_funds_available_position()? + 8;
        Ok(position)
    }

    pub fn get_total_proceeds_settled(&self, data: &[u8]) -> Result<u64> {
        if self.version < 5 {
            return Ok(0);
        }

        let position = self.get_total_proceeds_settled_position()?;
        Ok(u64::from_le_bytes(
            data[position..position + 8].try_into().unwrap(),
        ))
    }

    pub fn can_edit_items(&self) -> bool {
        self.state == GumballState::None || self.state == GumballState::DetailsFinalized
    }

    pub fn can_add_items(&self) -> bool {
        self.can_edit_items()
            || (self.state == GumballState::SaleLive && !self.is_collab() && self.version >= 5)
    }

    pub fn is_collab(&self) -> bool {
        self.settings.sellers_merkle_root.is_some()
    }

    pub fn can_settle_items(&self) -> bool {
        self.state == GumballState::SaleEnded
            || (self.state == GumballState::SaleLive && !self.is_collab() && self.version >= 5)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct FeeConfig {
    /// Where fees will go
    pub fee_account: Pubkey,
    /// Sale basis points for fees
    pub fee_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, Default)]
pub struct BuyBackConfig {
    /// Whether buying back prizes is enabled
    pub enabled: bool,
    /// Whether buying back prizes should be added back to the gumball machine (not yet supported)
    pub to_gumball_machine: bool,
    /// Authority that must sign when buying back prizes, to ensure pricing is correct
    pub oracle_signer: Pubkey,
    /// Percentage of prize value the creator/gumball machine will pay for buying back prizes
    pub value_pct: u8,
    /// Fee in basis points paid to marketplace authority when buying back prizes (paid from funds_available)
    pub marketplace_fee_bps: u16,
    /// Buy backs are disabled when the percentage of items remaining is less than or equal to this value
    /// 0 means there is no cutoff, 100 means buy back is always disabled, 50 means buy back is disabled when 50% of items are sold
    /// If an item is sold back to the gumball machine to increase the remaining % above this cutoff, buy back is re-enabled
    pub cutoff_pct: u8,
}

/// Config line struct for storing asset (NFT) data pre-mint.
#[derive(AnchorSerialize, AnchorDeserialize, Debug)]
pub struct ConfigLineInput {
    /// Mint account of the asset.
    pub mint: Pubkey,
    /// Wallet that submitted the asset for sale.
    pub seller: Pubkey,
}

/// Config line struct for storing asset (NFT) data pre-mint.
#[derive(AnchorSerialize, AnchorDeserialize, Debug)]
pub struct ConfigLineV2Input {
    /// Mint account of the asset.
    pub mint: Pubkey,
    /// Wallet that submitted the asset for sale.
    pub seller: Pubkey,
    /// Amount of the asset.
    pub amount: u64,
}

/// Config line struct for storing asset data.
#[derive(AnchorSerialize, AnchorDeserialize, Debug)]
pub struct ConfigLine {
    /// Mint account of the asset.
    pub mint: Pubkey,
    /// Wallet that submitted the asset for sale.
    pub seller: Pubkey,
    /// Wallet that will receive the asset upon sale. Empty until drawn.
    pub buyer: Pubkey,
    /// Token standard.
    pub token_standard: TokenStandard,
}

/// Config line struct for storing asset data.
#[derive(AnchorSerialize, AnchorDeserialize, Debug, InitSpace)]
pub struct ConfigLineV2 {
    /// Mint account of the asset.
    pub mint: Pubkey,
    /// Wallet that submitted the asset for sale.
    pub seller: Pubkey,
    /// Wallet that will receive the asset upon sale. Empty until drawn.
    pub buyer: Pubkey,
    /// Token standard.
    pub token_standard: TokenStandard,
    /// Amount of the asset.
    pub amount: u64,
}

#[derive(Copy, AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub enum TokenStandard {
    NonFungible,
    Core,
    Fungible,
    ProgrammableNonFungible,
}

#[derive(Copy, AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum GumballState {
    None,             // Initial state
    DetailsFinalized, // Sellers invited so only some details can be updated
    SaleLive, // Sale started, can now mint items. Cannot no longer update details or add items.
    SaleEnded, // Sale ended, can now settle items
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct GumballSettings {
    /// Uri of off-chain metadata, max length 196
    pub uri: String,
    /// Number of assets that can be added.
    pub item_capacity: u64,
    /// Max number of items that can be added by a single seller.
    pub items_per_seller: u16,
    /// Merkle root hash for sellers who can add items to the machine.
    pub sellers_merkle_root: Option<[u8; 32]>,
    /// Fee basis points paid to the machine authority.
    pub curator_fee_bps: u16,
    /// True if the front end should hide items that have been sold.
    pub hide_sold_items: bool,
    /// Payment token for the mint
    pub payment_mint: Pubkey,
}
