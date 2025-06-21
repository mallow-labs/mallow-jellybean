# Jellybean Machine: Analysis & Implementation Overview

## Key Differences from Gumball Machine

The jellybean machine needs these fundamental changes from the current gumball machine:

1. **Dynamic Space Allocation** - No pre-allocation of full item space
2. **Single Seller Model** - Remove collaborative sales support
3. **Printable NFT Support** - Handle Master Editions and limited supplies
4. **Supply-Based Drawing** - Drawing chance based on available supply

---

## State Account Changes

### 1. JellybeanMachine State (Modified GumballMachine)

```rust
#[account]
pub struct JellybeanMachine {
    /// Version of the account
    pub version: u8,
    /// Authority address (single creator/seller)
    pub authority: Pubkey,
    /// Authority address allowed to mint from the machine
    pub mint_authority: Pubkey,
    /// Fee config for marketplace
    pub marketplace_fee_config: Option<FeeConfig>,
    /// Number of items drawn
    pub items_drawn: u64,
    /// Total available supply across all items
    pub total_supply: u64,
    /// Total revenue
    pub total_revenue: u64,
    /// Machine state
    pub state: JellybeanState,
    /// Settings
    pub settings: JellybeanSettings,
    // Dynamic data section:
    // - ItemEntry[] (variable length, appended as items are added)
    // - DrawnItem[] (variable length, appended as items are drawn)
}
```

**Key Changes:**

- Remove `seller_history` related fields (single seller)
- Change `items_redeemed` to `items_drawn`
- Add `total_supply` to track available supply across all items
- Remove pre-allocated config lines - use dynamic `ItemEntry` and `DrawnItem` arrays

### 2. New ItemEntry Structure

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Debug)]
pub struct ItemEntry {
    /// Asset mint address
    pub mint: Pubkey,
    /// Available supply (for master editions)
    pub available_supply: u32,
    /// Max supply (for master editions, 0 for 1/1s)
    pub max_supply: u32,
    /// Asset type
    pub asset_type: AssetType,
    /// Token standard
    pub token_standard: TokenStandard,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug)]
pub enum AssetType {
    OneOfOne,                    // Single 1/1 NFT
    MasterEdition,              // Metaplex Legacy Master Edition
    CoreCollectionWithPlugin,   // Metaplex Core with MasterEdition plugin
}
```

### 3. New DrawnItem Structure

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Debug)]
pub struct DrawnItem {
    /// Original item entry index
    pub item_index: u32,
    /// Buyer address
    pub buyer: Pubkey,
    /// Edition number (for printable items)
    pub edition_number: Option<u32>,
    /// Timestamp when drawn
    pub timestamp: i64,
    /// Status
    pub status: DrawnItemStatus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug)]
pub enum DrawnItemStatus {
    Drawn,      // Item drawn but not yet claimed
    Claimed,    // Item claimed by buyer
    Settled,    // Sale settled with seller
}
```

### 4. Remove Collaborative Sales State

**Accounts to Remove:**

- `SellerHistory` - Not needed for single seller
- `AddItemRequest` - Simplified direct addition

---

## Instruction Changes

### Instructions to Remove/Simplify

1. **Remove Collaborative Sales Instructions:**

   - `request_add_nft`
   - `request_add_core_asset`
   - `cancel_add_nft_request`
   - `cancel_add_core_asset_request`
   - `approve_add_item`

2. **Simplify Add Item Instructions:**
   - `add_nft` → `add_item` (unified for all asset types)
   - Remove seller validation logic
   - Remove `SellerHistory` account

### New/Modified Instructions

#### 1. `add_item` (Unified)

```rust
pub fn add_item(ctx: Context<AddItem>, args: AddItemArgs) -> Result<()>

pub struct AddItemArgs {
    pub asset_type: AssetType,
    pub max_supply: Option<u32>, // Required for master editions
}
```

**Key Changes:**

- Single instruction for all asset types
- Validate master edition supply limits
- Append `ItemEntry` to dynamic data section
- Update `total_supply` based on asset type

#### 2. `draw` (Modified)

```rust
pub fn draw(ctx: Context<Draw>) -> Result<()>
```

**Key Changes:**

- Implement supply-weighted random selection
- Append `DrawnItem` to dynamic data section
- Decrement available supply for selected item
- No pre-allocated config line updates

#### 3. `claim_item` (Unified)

```rust
pub fn claim_item(ctx: Context<ClaimItem>, drawn_item_index: u32) -> Result<()>
```

**Key Changes:**

- Single instruction for all asset types
- Handle printing for master editions
- Update `DrawnItem` status

### Instructions to Keep (with modifications)

- `initialize` - Remove collaborative sales settings
- `update_settings` - Simplified settings
- `start_sale` / `end_sale` - Keep as-is
- `settle_sale` - Simplified for single seller
- `set_authority` / `set_mint_authority` - Keep as-is

---

## Core Logic Changes

### 1. Dynamic Space Management

```rust
impl JellybeanMachine {
    pub fn add_item_entry(&mut self, account_data: &mut [u8], entry: ItemEntry) -> Result<()> {
        // Find current end of ItemEntry array
        // Append new entry
        // Update total_supply
    }

    pub fn add_drawn_item(&mut self, account_data: &mut [u8], drawn_item: DrawnItem) -> Result<()> {
        // Find current end of DrawnItem array
        // Append new drawn item
    }
}
```

### 2. Supply-Weighted Drawing Algorithm

```rust
fn select_item_by_supply(items: &[ItemEntry], total_supply: u64, random_seed: u64) -> Result<usize> {
    let target = random_seed % total_supply;
    let mut cumulative = 0u64;

    for (index, item) in items.iter().enumerate() {
        cumulative += item.available_supply as u64;
        if target < cumulative {
            return Ok(index);
        }
    }

    Err(GumballError::InvalidSelection)
}
```

### 3. Master Edition Validation

```rust
fn validate_master_edition(mint: Pubkey, max_supply: u32) -> Result<()> {
    // Validate it's actually a master edition
    // Validate supply is limited (max_supply > 0)
    // Validate current supply hasn't exceeded max
}
```

---

## Account Size Optimization

### Current Gumball Machine Issues

- Pre-allocates space for all items: `CONFIG_LINE_SIZE * item_capacity`
- Pre-allocates bitmasks for tracking: `(item_capacity / 8) + 1` each
- Fixed size regardless of actual items

### Jellybean Machine Improvements

- Start with base size: `JELLYBEAN_MACHINE_BASE_SIZE`
- Grow dynamically as items are added
- Use `realloc` instruction to expand account
- Much more memory efficient for smaller collections

```rust
pub const JELLYBEAN_MACHINE_BASE_SIZE: usize = 8 // discriminator
    + 1     // version
    + 32    // authority
    + 32    // mint_authority
    + 33    // marketplace_fee_config (optional)
    + 8     // items_drawn
    + 8     // total_supply
    + 8     // total_revenue
    + 1     // state
    + 256;  // settings (estimated)
```

---

## Migration Considerations

1. **Guard Compatibility** - Keep same guard integration points
2. **Event Structure** - Maintain similar events for frontend compatibility
3. **Error Codes** - Reuse applicable error codes from gumball machine
4. **SDK Compatibility** - Design for easy JS client integration

---

## Implementation Priority

1. **Phase 1:** Core state accounts and basic instructions
2. **Phase 2:** Dynamic space allocation and drawing logic
3. **Phase 3:** Master edition support and validation
4. **Phase 4:** Guard integration and testing
5. **Phase 5:** Migration tools and documentation

This redesign achieves the main optimization goals: eliminating pre-allocation overhead, removing collaborative sales complexity, and supporting both printable and 1/1 NFTs with supply-based drawing probabilities.
