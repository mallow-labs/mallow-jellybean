# mallow Gumball Machine

## Overview

The mallow Gumball Machine is a fork of the Metaplex Protocol's Candy Machine, designed to enhance flexibility and collaboration in NFT distribution on Solana. This iteration allows for the use of pre-minted NFTs, supporting both Metaplex Legacy and Core NFT standards, instead of minting new ones during the distribution process. SPL token prizes can also be loaded. The prize selected on each draw use the same randomness as the original Candy Machine implementation.

Key features of the mallow Gumball Machine include:

- Support for pre-minted NFTs: Users can add existing Metaplex Legacy and Core NFTs to Gumball Machines.
- Support for SPL token prizes
- Collaborative curation: Curators can invite multiple sellers to add their NFTs to a single Gumball Machine.
- Curator fee system: Curators can set and receive a fee for each sale from the Gumball Machine.
- Marketplace fee system: Marketplaces hosting the Gumball sale can set and receive a fee for each sale from the Gumball Machine.
- Socialized proceeds: Sellers receive an equal share of the total proceeds per NFT they contributed to the Gumball Machine.
- Enforced royalties: Royalties are always disbursed according to their definition in the NFT metadata.

The mallow Gumball Machine is responsible for:

- Prize management: Configuration of how many prizes are available and their metadata information.
- Index generation and selection: For fair and random distribution of NFTs.
- Prize distribution: Transferring ownership of prizes to buyers.

### Why use pre-minted NFTs?

Using pre-minted NFTs offers several advantages:

1. Secondaries: Allows users to re-sell their minted NFTs as a secondary sale.
2. Collaboration: Enables multiple artists or sellers to contribute to a single Gumball Machine.

### Who can add NFTs to a Gumball Machine?

The mallow Gumball Machine introduces a collaborative model:

- The `authority` of the Gumball Machine can add NFTs.
- Invited sellers can add their pre-minted NFTs to the Gumball Machine.
- Users can request to add a prize and the Curator can approve the addition.

This model allows for community-driven curation and distribution of NFTs, while still providing a mechanism for curators to be compensated for their efforts.

### How are proceeds distributed?

The mallow Gumball Machine implements a socialized proceeds model:

- Total proceeds from sales are pooled together.
- Each seller receives an equal share of the total proceeds per NFT they contributed to the Gumball Machine.
- The optional curator fee and optional marketplace fee is deducted before the proceeds are distributed to sellers.

This model ensures fair compensation for all participating sellers, regardless of which specific NFTs are sold.

## Account

The `GumballMachine` state is stored in a single account, which includes settings that
control the behaviour of the gumball machine and metadata information for the NFTs sold through it.
The account data is represented by the
[`GumballMachine`](https://github.com/mallow-labs/mallow-gumball/blob/febo/mallow-gumball/mallow-gumball/program/src/state/gumball_machine.rs)
struct, which include references to auxiliary structs
`ConfigLineSettings` and `HiddenSettings`.

| Field                     | Offset | Size | Description                                                                                                     |
| ------------------------- | ------ | ---- | --------------------------------------------------------------------------------------------------------------- |
| &mdash;                   | 0      | 8    | Anchor account discriminator.                                                                                   |
| `version`                 | 8      | 1    | Version of the account.                                                                                         |
| `authority`               | 9      | 32   | Authority address.                                                                                              |
| `mint_authority`          | 41     | 32   | Authority address allowed to mint from the gumball machine.                                                     |
| `marketplace_fee_config`  | 73     | 34   | (Optional) Fee config for the marketplace this gumball is listed on.                                            |
| `items_redeemed`          | 107    | 8    | Number of assets redeemed.                                                                                      |
| `items_settled`           | 115    | 8    | Number of assets settled after sale.                                                                            |
| `total_revenue`           | 123    | 8    | Amount of lamports/tokens received from purchases.                                                              |
| `state`                   | 131    | 1    | State of the gumball machine (enum: None, DetailsFinalized, SaleLive, SaleEnded).                               |
| `settings`                | 132    | ~    | User-defined settings (GumballSettings struct).                                                                 |
| - `uri`                   | ~      | 196  | Uri of off-chain metadata, max length 196.                                                                      |
| - `item_capacity`         | ~      | 8    | Number of assets that can be added.                                                                             |
| - `items_per_seller`      | ~      | 2    | Max number of items that can be added by a single seller.                                                       |
| - `sellers_merkle_root`   | ~      | 32   | (Optional) Merkle root hash for sellers who can add items to the machine.                                       |
| - `curator_fee_bps`       | ~      | 2    | Fee basis points paid to the machine authority.                                                                 |
| - `hide_sold_items`       | ~      | 1    | True if the front end should hide items that have been sold.                                                    |
| - `payment_mint`          | ~      | 32   | Payment token for the mint.                                                                                     |
| _hidden section_          | ~      | ~    | Hidden data section to avoid unnecessary deserialization.                                                       |
| - _items_inserted_        | ~      | 4    | (u32) Number of actual lines of data currently inserted (eventually equals item_capacity).                      |
| - _config lines_          | ~      | ~    | (CONFIG_LINE_SIZE \* item_capacity) Config lines for storing asset data.                                        |
| - _claimed items mask_    | ~      | ~    | (item_capacity / 8) + 1 bit mask to keep track of which items have been claimed.                                |
| - _settled items mask_    | ~      | ~    | (item_capacity / 8) + 1 bit mask to keep track of which items have been settled.                                |
| - _mint indices_          | ~      | ~    | (u32 \* item_capacity) mint indices.                                                                            |
| - _disable_primary_split_ | ~      | 1    | (boolean) disable sale proceeds going to creators on a primary sale (all proceeds less royalties go to seller). |

### `GumballSettings`

| Field                 | Offset | Size | Description                                                               |
| --------------------- | ------ | ---- | ------------------------------------------------------------------------- |
| `uri`                 | 0      | 196  | Uri of off-chain metadata, max length 196.                                |
| `item_capacity`       | 196    | 8    | Number of assets that can be added.                                       |
| `items_per_seller`    | 204    | 2    | Max number of items that can be added by a single seller.                 |
| `sellers_merkle_root` | 206    | 33   | (Optional) Merkle root hash for sellers who can add items to the machine. |
| `curator_fee_bps`     | 239    | 2    | Fee basis points paid to the machine authority.                           |
| `hide_sold_items`     | 241    | 1    | True if the front end should hide items that have been sold.              |
| `payment_mint`        | 242    | 32   | Payment token for the mint.                                               |

### `FeeConfig`

Used by the marketplace/platform hosting the Gumball sale to take an optional fee from sales.

| Field         | Offset | Size | Description                 |
| ------------- | ------ | ---- | --------------------------- |
| `fee_account` | 0      | 32   | Where fees will go.         |
| `fee_bps`     | 32     | 2    | Sale basis points for fees. |

### `GumballState`

| Value              | Description                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| `None`             | Initial state                                                                |
| `DetailsFinalized` | Sellers invited so only some details can be updated                          |
| `SaleLive`         | Sale started, can now mint items. Can no longer update details or add items. |
| `SaleEnded`        | Sale ended, can now settle items                                             |

## Instructions

### 📄 `initialize`

This instruction creates and initializes a new `GumballMachine` account with the specified settings and fee configuration.

<details>
  <summary>Accounts</summary>

| Name              | Writable | Signer | Description                                                         |
| ----------------- | :------: | :----: | ------------------------------------------------------------------- |
| `gumball_machine` |    ✅    |        | The `GumballMachine` account (uninitialized).                       |
| `authority`       |          |        | Public key of the gumball machine authority.                        |
| `authority_pda`   |    ✅    |        | Authority PDA account (PDA, seeds: ["authority", gumball_machine]). |
| `payer`           |    ✅    |   ✅   | Payer of the transaction.                                           |
| `system_program`  |          |        | System program account.                                             |

</details>

<details>
  <summary>Arguments</summary>

| Argument                | Description                                                   |
| ----------------------- | ------------------------------------------------------------- |
| `settings`              | `GumballSettings` object.                                     |
| `fee_config`            | Optional `FeeConfig` object.                                  |
| `disable_primary_split` | Whether to disable primary sale creator splits for all items. |

</details>

### 📄 `update_settings`

This instruction updates the gumball machine settings.

<details>
  <summary>Accounts</summary>

| Name              | Writable | Signer | Description                                  |
| ----------------- | :------: | :----: | -------------------------------------------- |
| `gumball_machine` |    ✅    |        | The `GumballMachine` account.                |
| `authority`       |          |   ✅   | Public key of the gumball machine authority. |

</details>

<details>
  <summary>Arguments</summary>

| Argument   | Description               |
| ---------- | ------------------------- |
| `settings` | `GumballSettings` object. |

</details>

### 📄 `add_nft`

This instruction adds a legacy NFT to the gumball machine.

<details>
  <summary>Accounts</summary>

| Name                     | Writable | Signer | Description                                                                       |
| ------------------------ | :------: | :----: | --------------------------------------------------------------------------------- |
| `gumball_machine`        |    ✅    |        | The `GumballMachine` account.                                                     |
| `seller_history`         |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]). |
| `authority_pda`          |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                       |
| `seller`                 |    ✅    |   ✅   | Seller of the NFT.                                                                |
| `mint`                   |          |        | Mint account of the NFT.                                                          |
| `token_account`          |    ✅    |        | Seller's token account for the NFT.                                               |
| `metadata`               |    ✅    |        | Metadata account of the NFT.                                                      |
| `edition`                |          |        | Edition account of the NFT.                                                       |
| `token_program`          |          |        | Token program account.                                                            |
| `token_metadata_program` |          |        | Token Metadata program account.                                                   |
| `system_program`         |          |        | System program account.                                                           |
| `seller_token_record`    |    ✅    |        | Seller token record account (pNFT, optional).                                     |
| `auth_rules`             |          |        | Auth rules account (pNFT, optional).                                              |
| `sysvar_instructions`    |          |        | Instructions sysvar (pNFT, optional).                                             |
| `auth_rules_program`     |          |        | Auth rules program (pNFT, optional).                                              |

</details>

<details>
  <summary>Arguments</summary>

| Argument            | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `seller_proof_path` | Merkle proof for seller verification if `sellers_merkle_root` is set. |

</details>

### 📄 `add_core_asset`

This instruction adds a Core asset to the gumball machine.

<details>
  <summary>Accounts</summary>

| Name               | Writable | Signer | Description                                                                       |
| ------------------ | :------: | :----: | --------------------------------------------------------------------------------- |
| `gumball_machine`  |    ✅    |        | The `GumballMachine` account.                                                     |
| `seller_history`   |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]). |
| `authority_pda`    |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                       |
| `seller`           |    ✅    |   ✅   | Seller of the asset.                                                              |
| `asset`            |    ✅    |        | Asset account.                                                                    |
| `collection`       |    ✅    |        | Collection account if asset is part of one (optional).                            |
| `mpl_core_program` |          |        | MPL Core program account.                                                         |
| `system_program`   |          |        | System program account.                                                           |

</details>

<details>
  <summary>Arguments</summary>

| Argument            | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `seller_proof_path` | Merkle proof for seller verification if `sellers_merkle_root` is set. |

</details>

### 📄 `add_tokens`

This instruction adds fungible tokens to the gumball machine.

<details>
  <summary>Accounts</summary>

| Name                          | Writable | Signer | Description                                                                       |
| ----------------------------- | :------: | :----: | --------------------------------------------------------------------------------- |
| `gumball_machine`             |    ✅    |        | The `GumballMachine` account.                                                     |
| `seller_history`              |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]). |
| `authority_pda`               |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                       |
| `seller`                      |    ✅    |   ✅   | Seller of the tokens.                                                             |
| `mint`                        |          |        | Mint account of the tokens.                                                       |
| `token_account`               |    ✅    |        | Seller's token account for the mint.                                              |
| `authority_pda_token_account` |    ✅    |        | Authority PDA's token account for the mint.                                       |
| `token_program`               |          |        | Token program account.                                                            |
| `associated_token_program`    |          |        | Associated Token program account.                                                 |
| `system_program`              |          |        | System program account.                                                           |
| `rent`                        |          |        | Rent sysvar.                                                                      |

</details>

<details>
  <summary>Arguments</summary>

| Argument            | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `amount`            | The amount of tokens per item being added.                            |
| `quantity`          | The number of items being added (each containing `amount` tokens).    |
| `seller_proof_path` | Merkle proof for seller verification if `sellers_merkle_root` is set. |

</details>

### 📄 `remove_nft`

This instruction removes a legacy NFT from the gumball machine. It thaws and revokes the delegate from the seller's NFT and removes the item from the `GumballMachine` config lines. The signer (`authority`) must be either the gumball machine authority or the seller of the NFT being removed.

<details>
  <summary>Accounts</summary>

| Name                          | Writable | Signer | Description                                                                       |
| ----------------------------- | :------: | :----: | --------------------------------------------------------------------------------- |
| `gumball_machine`             |    ✅    |        | The `GumballMachine` account.                                                     |
| `seller_history`              |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]). |
| `authority_pda`               |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                       |
| `authority`                   |          |   ✅   | Authority allowed to remove (gumball machine authority or item seller).           |
| `seller`                      |    ✅    |        | Seller account (owner of the NFT).                                                |
| `mint`                        |          |        | Mint account of the NFT.                                                          |
| `token_account`               |    ✅    |        | Seller's token account for the NFT.                                               |
| `authority_pda_token_account` |    ✅    |        | Authority PDA's token account for the NFT.                                        |
| `edition`                     |          |        | Edition account of the NFT.                                                       |
| `token_program`               |          |        | Token program account.                                                            |
| `associated_token_program`    |          |        | Associated Token program account.                                                 |
| `token_metadata_program`      |          |        | Token Metadata program account.                                                   |
| `system_program`              |          |        | System program account.                                                           |
| `rent`                        |          |        | Rent sysvar.                                                                      |
| `metadata`                    |    ✅    |        | Metadata account (pNFT, optional).                                                |
| `seller_token_record`         |    ✅    |        | Seller token record account (pNFT, optional).                                     |
| `auth_rules`                  |          |        | Auth rules account (pNFT, optional).                                              |
| `sysvar_instructions`         |          |        | Instructions sysvar (pNFT, optional).                                             |
| `auth_rules_program`          |          |        | Auth rules program (pNFT, optional).                                              |

</details>

<details>
  <summary>Arguments</summary>

| Argument | Description                    |
| -------- | ------------------------------ |
| `index`  | The index of the NFT to remove |

</details>

### 📄 `remove_core_asset`

This instruction removes a Core asset from the gumball machine. It thaws and revokes the delegate from the seller's asset and removes the item from the `GumballMachine` config lines. The signer (`authority`) must be either the gumball machine authority or the seller of the asset being removed.

<details>
  <summary>Accounts</summary>

| Name               | Writable | Signer | Description                                                                       |
| ------------------ | :------: | :----: | --------------------------------------------------------------------------------- |
| `gumball_machine`  |    ✅    |        | The `GumballMachine` account.                                                     |
| `seller_history`   |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]). |
| `authority_pda`    |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                       |
| `authority`        |          |   ✅   | Authority allowed to remove (gumball machine authority or item seller).           |
| `seller`           |    ✅    |        | Seller account (owner of the asset).                                              |
| `asset`            |    ✅    |        | Asset account.                                                                    |
| `collection`       |    ✅    |        | Collection account if asset is part of one (optional).                            |
| `mpl_core_program` |          |        | MPL Core program account.                                                         |
| `system_program`   |          |        | System program account.                                                           |

</details>

<details>
  <summary>Arguments</summary>

| Argument | Description                           |
| -------- | ------------------------------------- |
| `index`  | The index of the Core asset to remove |

</details>

### 📄 `start_sale`

This instruction allows drawing from the gumball machine to begin by setting the state to `SaleLive`. Requires the gumball machine to have at least one item.

<details>
  <summary>Accounts</summary>

| Name              | Writable | Signer | Description                                                               |
| ----------------- | :------: | :----: | ------------------------------------------------------------------------- |
| `gumball_machine` |    ✅    |        | The `GumballMachine` account.                                             |
| `authority`       |          |   ✅   | Gumball Machine authority (can be `authority` or `mint_authority` field). |

</details>

<details>
  <summary>Arguments</summary>

None.

</details>

### 📄 `end_sale`

This instruction disables minting and allows sales to be settled.

<details>
  <summary>Accounts</summary>

| Name              | Writable | Signer | Description                                  |
| ----------------- | :------: | :----: | -------------------------------------------- |
| `gumball_machine` |    ✅    |        | The `GumballMachine` account.                |
| `authority`       |          |   ✅   | Public key of the gumball machine authority. |

</details>

<details>
  <summary>Arguments</summary>

None.

</details>

### 📄 `draw`

This instruction pseudo-randomly selects an available item from the `GumballMachine` config lines, assigns the `buyer` pubkey to it, and increments the `items_redeemed` count. Only callable by the `mint_authority` when the gumball machine state is `SaleLive`.

<details>
  <summary>Accounts</summary>

| Name                | Writable | Signer | Description                                       |
| ------------------- | :------: | :----: | ------------------------------------------------- |
| `gumball_machine`   |    ✅    |        | The `GumballMachine` account.                     |
| `mint_authority`    |          |   ✅   | Gumball Machine mint authority.                   |
| `payer`             |    ✅    |   ✅   | Payer for the transaction.                        |
| `buyer`             |          |        | Account that will receive the item (pubkey only). |
| `system_program`    |          |        | System program account.                           |
| `recent_slothashes` |          |        | SlotHashes sysvar cluster data.                   |

</details>

<details>
  <summary>Arguments</summary>

None.

</details>

### 📄 `increment_total_revenue`

This instruction increments the total revenue earned by the gumball machine.

<details>
  <summary>Accounts</summary>

| Name              | Writable | Signer | Description                                       |
| ----------------- | :------: | :----: | ------------------------------------------------- |
| `gumball_machine` |    ✅    |        | The `GumballMachine` account.                     |
| `mint_authority`  |          |   ✅   | Public key of the gumball machine mint authority. |

</details>

<details>
  <summary>Arguments</summary>

| Argument  | Description                        |
| --------- | ---------------------------------- |
| `revenue` | The amount of revenue to increment |

</details>

### 📄 `claim_core_asset`

This instruction claims a Core asset from the gumball machine for a specific buyer. Transfers the asset from the PDA to the buyer. Can be called by anyone (`payer`).

<details>
  <summary>Accounts</summary>

| Name               | Writable | Signer | Description                                                          |
| ------------------ | :------: | :----: | -------------------------------------------------------------------- |
| `payer`            |    ✅    |   ✅   | Payer for the transaction (anyone can claim the item for the buyer). |
| `gumball_machine`  |    ✅    |        | The `GumballMachine` account (must be `SaleLive` or `SaleEnded`).    |
| `authority_pda`    |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).          |
| `seller`           |    ✅    |        | Seller account (from config line).                                   |
| `buyer`            |          |        | Buyer account (from config line).                                    |
| `system_program`   |          |        | System program account.                                              |
| `asset`            |    ✅    |        | Asset account (from config line).                                    |
| `collection`       |    ✅    |        | Collection account if asset is part of one (optional).               |
| `mpl_core_program` |          |        | MPL Core program account.                                            |

</details>

<details>
  <summary>Arguments</summary>

| Argument | Description                          |
| -------- | ------------------------------------ |
| `index`  | The index of the Core asset to claim |

</details>

### 📄 `claim_nft`

This instruction claims a legacy NFT from the gumball machine for a specific buyer. Thaws and transfers the NFT from the PDA to the buyer. Can be called by anyone (`payer`).

<details>
  <summary>Accounts</summary>

| Name                          | Writable | Signer | Description                                                          |
| ----------------------------- | :------: | :----: | -------------------------------------------------------------------- |
| `payer`                       |    ✅    |   ✅   | Payer for the transaction (anyone can claim the item for the buyer). |
| `gumball_machine`             |    ✅    |        | The `GumballMachine` account (must be `SaleLive` or `SaleEnded`).    |
| `authority_pda`               |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).          |
| `seller`                      |    ✅    |        | Seller account (from config line).                                   |
| `buyer`                       |          |        | Buyer account (from config line).                                    |
| `token_program`               |          |        | Token program account.                                               |
| `associated_token_program`    |          |        | Associated Token program account.                                    |
| `system_program`              |          |        | System program account.                                              |
| `rent`                        |          |        | Rent sysvar.                                                         |
| `mint`                        |          |        | Mint account (from config line).                                     |
| `buyer_token_account`         |    ✅    |        | Buyer's token account (must match mint and buyer).                   |
| `authority_pda_token_account` |    ✅    |        | Authority PDA's token account (must match mint and authority PDA).   |
| `metadata`                    |    ✅    |        | Metadata account of the NFT.                                         |
| `edition`                     |    ✅    |        | Edition account of the NFT.                                          |
| `token_metadata_program`      |          |        | Token Metadata program account.                                      |
| `seller_token_record`         |    ✅    |        | Seller token record account (pNFT, optional).                        |
| `authority_pda_token_record`  |    ✅    |        | Authority PDA token record account (pNFT, optional).                 |
| `buyer_token_record`          |    ✅    |        | Buyer token record account (pNFT, optional).                         |
| `auth_rules`                  |          |        | Auth rules account (pNFT, optional).                                 |
| `instructions`                |          |        | Instructions sysvar (pNFT, optional).                                |
| `auth_rules_program`          |          |        | Auth rules program (pNFT, optional).                                 |

</details>

<details>
  <summary>Arguments</summary>

| Argument | Description                   |
| -------- | ----------------------------- |
| `index`  | The index of the NFT to claim |

</details>

### 📄 `settle_core_asset_sale`

This instruction settles a Core asset sale. If the item hasn't been claimed yet, it claims it for the seller (or buyer if specified). Distributes proceeds according to royalties and fee configuration. Can be called by anyone (`payer`).

<details>
  <summary>Accounts</summary>

| Name                            | Writable | Signer | Description                                                                       |
| ------------------------------- | :------: | :----: | --------------------------------------------------------------------------------- |
| `payer`                         |    ✅    |   ✅   | Payer for the transaction (anyone can settle the sale).                           |
| `gumball_machine`               |    ✅    |        | The `GumballMachine` account (must be `SaleEnded`).                               |
| `authority_pda`                 |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                       |
| `authority_pda_payment_account` |    ✅    |        | Authority PDA's payment token account (optional, required for non-native mint).   |
| `authority`                     |    ✅    |        | Gumball machine authority account (checked via `gumball_machine`).                |
| `authority_payment_account`     |    ✅    |        | Authority's payment token account (optional, required for non-native mint).       |
| `seller`                        |    ✅    |        | Seller account (from config line).                                                |
| `seller_payment_account`        |    ✅    |        | Seller's payment token account (optional, required for non-native mint).          |
| `seller_history`                |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]). |
| `buyer`                         |          |        | Buyer account (from config line).                                                 |
| `fee_account`                   |    ✅    |        | Fee account (optional, from `gumball_machine.marketplace_fee_config`).            |
| `fee_payment_account`           |    ✅    |        | Fee's payment token account (optional, required for non-native mint).             |
| `payment_mint`                  |          |        | Payment mint (optional, required for non-native mint).                            |
| `token_program`                 |          |        | Token program account.                                                            |
| `associated_token_program`      |          |        | Associated Token program account.                                                 |
| `system_program`                |          |        | System program account.                                                           |
| `rent`                          |          |        | Rent sysvar.                                                                      |
| `asset`                         |    ✅    |        | Asset account (from config line).                                                 |
| `collection`                    |    ✅    |        | Collection account if asset is part of one (optional).                            |
| `mpl_core_program`              |          |        | MPL Core program account.                                                         |
| _Remaining accounts_            |    ✅    |        | Royalty recipients' main accounts, followed by their payment accounts if needed.  |

</details>

<details>
  <summary>Arguments</summary>

| Argument | Description                                |
| -------- | ------------------------------------------ |
| `index`  | The index of the Core asset sale to settle |

</details>

### 📄 `settle_nft_sale`

This instruction settles a legacy NFT sale. If the item hasn't been claimed yet, it claims it for the seller (or buyer if specified). Distributes proceeds according to royalties and fee configuration. Marks primary sale happened if applicable. Can be called by anyone (`payer`).

<details>
  <summary>Accounts</summary>

| Name                            | Writable | Signer | Description                                                                       |
| ------------------------------- | :------: | :----: | --------------------------------------------------------------------------------- |
| `payer`                         |    ✅    |   ✅   | Payer for the transaction (anyone can settle the sale).                           |
| `gumball_machine`               |    ✅    |        | The `GumballMachine` account (must be `SaleEnded`).                               |
| `authority_pda`                 |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                       |
| `authority_pda_payment_account` |    ✅    |        | Authority PDA's payment token account (optional, required for non-native mint).   |
| `authority`                     |    ✅    |        | Gumball machine authority account (checked via `gumball_machine`).                |
| `authority_payment_account`     |    ✅    |        | Authority's payment token account (optional, required for non-native mint).       |
| `seller`                        |    ✅    |        | Seller account (from config line).                                                |
| `seller_payment_account`        |    ✅    |        | Seller's payment token account (optional, required for non-native mint).          |
| `seller_history`                |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]). |
| `buyer`                         |          |        | Buyer account (from config line).                                                 |
| `fee_account`                   |    ✅    |        | Fee account (optional, from `gumball_machine.marketplace_fee_config`).            |
| `fee_payment_account`           |    ✅    |        | Fee's payment token account (optional, required for non-native mint).             |
| `payment_mint`                  |          |        | Payment mint (optional, required for non-native mint).                            |
| `token_program`                 |          |        | Token program account.                                                            |
| `associated_token_program`      |          |        | Associated Token program account.                                                 |
| `system_program`                |          |        | System program account.                                                           |
| `rent`                          |          |        | Rent sysvar.                                                                      |
| `mint`                          |          |        | Mint account (from config line).                                                  |
| `buyer_token_account`           |    ✅    |        | Buyer's token account (must match mint and buyer).                                |
| `authority_pda_token_account`   |    ✅    |        | Authority PDA's token account (must match mint and authority PDA).                |
| `metadata`                      |    ✅    |        | Metadata account of the NFT.                                                      |
| `edition`                       |    ✅    |        | Edition account of the NFT.                                                       |
| `token_metadata_program`        |          |        | Token Metadata program account.                                                   |
| `seller_token_record`           |    ✅    |        | Seller token record account (pNFT, optional).                                     |
| `authority_pda_token_record`    |    ✅    |        | Authority PDA token record account (pNFT, optional).                              |
| `buyer_token_record`            |    ✅    |        | Buyer token record account (pNFT, optional).                                      |
| `auth_rules`                    |          |        | Auth rules account (pNFT, optional).                                              |
| `instructions`                  |          |        | Instructions sysvar (pNFT, optional).                                             |
| `auth_rules_program`            |          |        | Auth rules program (pNFT, optional).                                              |
| _Remaining accounts_            |    ✅    |        | Royalty recipients' main accounts, followed by their payment accounts if needed.  |

</details>

<details>
  <summary>Arguments</summary>

| Argument | Description                         |
| -------- | ----------------------------------- |
| `index`  | The index of the NFT sale to settle |

</details>

### 📄 `settle_tokens_sale_claimed`

This instruction settles a range of fungible token sales (`start_index` to `end_index`) that have either been claimed or were never assigned a buyer (`buyer == Pubkey::default()`). It marks items as settled, distributes proceeds based on the gumball machine's fee configuration (no royalties for fungible tokens), and transfers any unsold tokens back to the `seller`. Can be called by anyone (`payer`) when the gumball machine state is `SaleEnded`.

<details>
  <summary>Accounts</summary>

| Name                            | Writable | Signer | Description                                                                       |
| ------------------------------- | :------: | :----: | --------------------------------------------------------------------------------- |
| `payer`                         |    ✅    |   ✅   | Payer for the transaction (anyone can settle the sale).                           |
| `gumball_machine`               |    ✅    |        | The `GumballMachine` account (must be `SaleEnded`).                               |
| `authority_pda`                 |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                       |
| `authority_pda_payment_account` |    ✅    |        | Authority PDA's payment token account (optional, required for non-native mint).   |
| `authority`                     |    ✅    |        | Gumball machine authority account (checked via `gumball_machine`).                |
| `authority_payment_account`     |    ✅    |        | Authority's payment token account (optional, required for non-native mint).       |
| `seller`                        |    ✅    |        | Seller account (from config line).                                                |
| `seller_payment_account`        |    ✅    |        | Seller's payment token account (optional, required for non-native mint).          |
| `seller_history`                |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]). |
| `payment_mint`                  |          |        | Payment mint (optional, required for non-native mint).                            |
| `token_program`                 |          |        | Token program account.                                                            |
| `associated_token_program`      |          |        | Associated Token program account.                                                 |
| `system_program`                |          |        | System program account.                                                           |
| `rent`                          |          |        | Rent sysvar.                                                                      |
| `mint`                          |          |        | Mint account (from config lines in range).                                        |
| `seller_token_account`          |    ✅    |        | Seller's token account (for receiving unsold tokens).                             |
| `authority_pda_token_account`   |    ✅    |        | Authority PDA's token account for the mint.                                       |
| _Remaining accounts_            |    ✅    |        | Fee recipients' main accounts, followed by their payment accounts if needed.      |

</details>

<details>
  <summary>Arguments</summary>

| Argument      | Type  | Description                                  |
| ------------- | ----- | -------------------------------------------- |
| `start_index` | `u32` | The starting index (inclusive) of the range. |
| `end_index`   | `u32` | The ending index (inclusive) of the range.   |

</details>

### 📄 `set_authority`

This instruction sets a new authority for the gumball machine.

<details>
  <summary>Accounts</summary>

| Name              | Writable | Signer | Description                                  |
| ----------------- | :------: | :----: | -------------------------------------------- |
| `gumball_machine` |    ✅    |        | The `GumballMachine` account.                |
| `authority`       |          |   ✅   | Public key of the gumball machine authority. |

</details>

<details>
  <summary>Arguments</summary>

| Argument        | Description                      |
| --------------- | -------------------------------- |
| `new_authority` | Public key of the new authority. |

</details>

### 📄 `set_mint_authority`

This instruction sets a new mint authority for the gumball machine. Requires the current `authority` and the `new_mint_authority` to sign.

<details>
  <summary>Accounts</summary>

| Name              | Writable | Signer | Description                         |
| ----------------- | :------: | :----: | ----------------------------------- |
| `gumball_machine` |    ✅    |        | The `GumballMachine` account.       |
| `authority`       |          |   ✅   | Current gumball machine authority.  |
| `mint_authority`  |          |   ✅   | New gumball machine mint authority. |

</details>

<details>
  <summary>Arguments</summary>

None.

</details>

### 📄 `withdraw`

This instruction closes the `GumballMachine` account and sends its rent lamports to the `authority`. It requires all items to be settled (`items_settled == config_count`). If a non-native `payment_mint` was used, it also closes the `authority_pda_payment_account` and transfers its remaining balance to the `authority`'s associated token account for that mint (which must be provided in remaining accounts). Requires both the `authority` and `mint_authority` to sign.

<details>
  <summary>Accounts</summary>

| Name                            | Writable | Signer | Description                                                                   |
| ------------------------------- | :------: | :----: | ----------------------------------------------------------------------------- |
| `gumball_machine`               |    ✅    |        | The `GumballMachine` account (will be closed).                                |
| `authority`                     |    ✅    |   ✅   | Gumball machine authority (receiver of rent lamports).                        |
| `mint_authority`                |    ✅    |   ✅   | Gumball machine mint authority.                                               |
| `authority_pda`                 |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                   |
| `authority_pda_payment_account` |    ✅    |        | Authority PDA's payment token account (optional, needed for non-native mint). |
| `token_program`                 |          |        | Token program account.                                                        |
| _Remaining accounts (optional)_ |          |        |                                                                               |
| `payment_mint`                  |          |        | Payment mint (if non-native).                                                 |
| `authority_payment_account`     |    ✅    |        | Authority's payment token account (if non-native).                            |
| `associated_token_program`      |          |        | Associated Token program account (if non-native).                             |
| `system_program`                |          |        | System program account (if non-native).                                       |
| `rent`                          |          |        | Rent sysvar (if non-native).                                                  |

</details>

<details>
  <summary>Arguments</summary>

None.

</details>

### 📄 `request_add_nft`

This instruction requests to add a legacy NFT to the gumball machine. It freezes the seller's NFT and creates an `AddItemRequest` account.

<details>
  <summary>Accounts</summary>

| Name                     | Writable | Signer | Description                                                                       |
| ------------------------ | :------: | :----: | --------------------------------------------------------------------------------- |
| `gumball_machine`        |    ✅    |        | The `GumballMachine` account.                                                     |
| `seller_history`         |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]). |
| `add_item_request`       |    ✅    |        | Add item request account (PDA, seeds: ["add_item_request", mint]).                |
| `authority_pda`          |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                       |
| `seller`                 |    ✅    |   ✅   | Seller of the NFT.                                                                |
| `mint`                   |          |        | Mint account of the NFT.                                                          |
| `token_account`          |    ✅    |        | Seller's token account for the NFT.                                               |
| `metadata`               |    ✅    |        | Metadata account of the NFT.                                                      |
| `edition`                |          |        | Edition account of the NFT.                                                       |
| `token_program`          |          |        | Token program account.                                                            |
| `token_metadata_program` |          |        | Token Metadata program account.                                                   |
| `system_program`         |          |        | System program account.                                                           |
| `seller_token_record`    |    ✅    |        | Seller token record account (pNFT, optional).                                     |
| `auth_rules`             |          |        | Auth rules account (pNFT, optional).                                              |
| `sysvar_instructions`    |          |        | Instructions sysvar (pNFT, optional).                                             |
| `auth_rules_program`     |          |        | Auth rules program (pNFT, optional).                                              |

</details>

<details>
  <summary>Arguments</summary>

None.

</details>

### 📄 `request_add_core_asset`

This instruction requests to add a Core asset to the gumball machine. It freezes the seller's asset and creates an `AddItemRequest` account.

<details>
  <summary>Accounts</summary>

| Name               | Writable | Signer | Description                                                                       |
| ------------------ | :------: | :----: | --------------------------------------------------------------------------------- |
| `gumball_machine`  |    ✅    |        | The `GumballMachine` account.                                                     |
| `seller_history`   |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]). |
| `add_item_request` |    ✅    |        | Add item request account (PDA, seeds: ["add_item_request", asset]).               |
| `authority_pda`    |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                       |
| `seller`           |    ✅    |   ✅   | Seller of the asset.                                                              |
| `asset`            |    ✅    |        | Asset account.                                                                    |
| `collection`       |    ✅    |        | Collection account if asset is part of one (optional).                            |
| `mpl_core_program` |          |        | MPL Core program account.                                                         |
| `system_program`   |          |        | System program account.                                                           |

</details>

<details>
  <summary>Arguments</summary>

None.

</details>

### 📄 `cancel_add_nft_request`

This instruction cancels a request to add a legacy NFT to the gumball machine. It thaws and revokes the delegate from the seller's NFT and closes the `AddItemRequest` account.

<details>
  <summary>Accounts</summary>

| Name                          | Writable | Signer | Description                                                                        |
| ----------------------------- | :------: | :----: | ---------------------------------------------------------------------------------- |
| `seller_history`              |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]).  |
| `add_item_request`            |    ✅    |        | Add item request account (PDA, seeds: ["add_item_request", mint]). Will be closed. |
| `authority_pda`               |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                        |
| `seller`                      |    ✅    |   ✅   | Seller of the NFT.                                                                 |
| `mint`                        |          |        | Mint account of the NFT.                                                           |
| `seller_token_account`        |    ✅    |        | Seller's token account for the NFT.                                                |
| `authority_pda_token_account` |    ✅    |        | Authority PDA's token account for the NFT.                                         |
| `edition`                     |          |        | Edition account of the NFT.                                                        |
| `token_program`               |          |        | Token program account.                                                             |
| `associated_token_program`    |          |        | Associated Token program account.                                                  |
| `token_metadata_program`      |          |        | Token Metadata program account.                                                    |
| `system_program`              |          |        | System program account.                                                            |
| `rent`                        |          |        | Rent sysvar.                                                                       |
| `metadata`                    |    ✅    |        | Metadata account (pNFT, optional).                                                 |
| `seller_token_record`         |    ✅    |        | Seller token record account (pNFT, optional).                                      |
| `auth_rules`                  |          |        | Auth rules account (pNFT, optional).                                               |
| `sysvar_instructions`         |          |        | Instructions sysvar (pNFT, optional).                                              |
| `auth_rules_program`          |          |        | Auth rules program (pNFT, optional).                                               |

</details>

<details>
  <summary>Arguments</summary>

None.

</details>

### 📄 `cancel_add_core_asset_request`

This instruction cancels a request to add a Core asset to the gumball machine. It thaws and revokes the delegate from the seller's asset and closes the `AddItemRequest` account.

<details>
  <summary>Accounts</summary>

| Name               | Writable | Signer | Description                                                                                        |
| ------------------ | :------: | :----: | -------------------------------------------------------------------------------------------------- |
| `seller_history`   |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", add_item_request.gumball_machine, seller]). |
| `add_item_request` |    ✅    |        | Add item request account (PDA, seeds: ["add_item_request", asset]). Will be closed.                |
| `authority_pda`    |    ✅    |        | Authority PDA (PDA, seeds: ["authority", add_item_request.gumball_machine]).                       |
| `seller`           |    ✅    |   ✅   | Seller of the asset.                                                                               |
| `asset`            |    ✅    |        | Asset account.                                                                                     |
| `collection`       |    ✅    |        | Collection account if asset is part of one (optional).                                             |
| `mpl_core_program` |          |        | MPL Core program account.                                                                          |
| `system_program`   |          |        | System program account.                                                                            |

</details>

<details>
  <summary>Arguments</summary>

None.

</details>

### 📄 `approve_add_item`

This instruction approves a request to add an item (NFT or Core asset) to the gumball machine. It moves the item details from the `AddItemRequest` account to the `GumballMachine` config lines and closes the `AddItemRequest` account.

<details>
  <summary>Accounts</summary>

| Name               | Writable | Signer | Description                                                                                 |
| ------------------ | :------: | :----: | ------------------------------------------------------------------------------------------- |
| `gumball_machine`  |    ✅    |        | The `GumballMachine` account.                                                               |
| `add_item_request` |    ✅    |        | Add item request account (PDA, seeds: ["add_item_request", asset_or_mint]). Will be closed. |
| `authority_pda`    |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                                 |
| `authority`        |          |   ✅   | Authority of the gumball machine.                                                           |
| `seller`           |    ✅    |        | Seller account (receiver of closed request account rent).                                   |
| `asset`            |          |        | Asset/Mint account pubkey (checked via add_item_request constraint).                        |
| `system_program`   |          |        | System program account.                                                                     |

</details>

<details>
  <summary>Arguments</summary>

None.

</details>

### 📄 `remove_tokens_span`

This instruction removes fungible token items from the gumball machine within a specified index range. The signer (`authority`) must be either the gumball machine authority or the seller of the tokens being removed. The removed tokens are transferred back to the seller.

<details>
  <summary>Accounts</summary>

| Name                          | Writable | Signer | Description                                                                       |
| ----------------------------- | :------: | :----: | --------------------------------------------------------------------------------- |
| `gumball_machine`             |    ✅    |        | The `GumballMachine` account.                                                     |
| `seller_history`              |    ✅    |        | Seller history account (PDA, seeds: ["seller_history", gumball_machine, seller]). |
| `authority_pda`               |    ✅    |        | Authority PDA (PDA, seeds: ["authority", gumball_machine]).                       |
| `authority`                   |    ✅    |   ✅   | Authority allowed to remove (gumball machine authority or item seller).           |
| `seller`                      |    ✅    |        | Seller account (owner of the tokens).                                             |
| `mint`                        |          |        | Mint account of the tokens.                                                       |
| `token_account`               |    ✅    |        | Seller's token account for the mint.                                              |
| `authority_pda_token_account` |    ✅    |        | Authority PDA's token account for the mint.                                       |
| `token_program`               |          |        | Token program account.                                                            |
| `associated_token_program`    |          |        | Associated Token program account.                                                 |
| `system_program`              |          |        | System program account.                                                           |
| `rent`                        |          |        | Rent sysvar.                                                                      |

</details>

<details>
  <summary>Arguments</summary>

| Argument      | Description                                                                |
| ------------- | -------------------------------------------------------------------------- |
| `amount`      | The amount of tokens per item being removed (must match the added amount). |
| `start_index` | The starting index (inclusive) of the token items to remove.               |
| `end_index`   | The ending index (inclusive) of the token items to remove.                 |

</details>
