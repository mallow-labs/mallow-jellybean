use anchor_lang::prelude::*;
pub use errors::*;
use instructions::*;
pub use state::*;
pub use utils::*;

pub mod constants;
pub mod errors;
mod events;
mod instructions;
mod processors;
mod state;
mod utils;

declare_id!("J3LLYcm8V5hJRzCKENRPW3yGdQ6xU8Nie8jr3mU88eqq");

#[program]
pub mod mallow_jellybean {
    use super::*;

    /// Initialize the jellybean machine account with the specified data.
    ///
    /// # Accounts
    ///
    ///   0. `[writable]` Gumball Machine account (must be pre-allocated but zero content)
    ///   1. `[]` Gumball Machine authority
    ///   2. `[writable]` Authority PDA (PDA, seeds: ["authority", jellybean_machine])
    ///   3. `[signer, writable]` Payer
    ///   4. `[]` System program
    pub fn initialize(ctx: Context<Initialize>, args: SettingsArgs) -> Result<()> {
        instructions::initialize(ctx, args)
    }

    /// Updates jellybean machine settings.
    ///
    /// # Accounts
    ///
    ///   0. `[writable]` Gumball Machine account
    ///   1. `[signer, writable]` Gumball Machine authority
    pub fn update_settings(ctx: Context<UpdateSettings>, args: SettingsArgs) -> Result<()> {
        instructions::update_settings(ctx, args)
    }

    /// Add Core assets to the jellybean machine.
    ///
    /// # Accounts
    ///
    ///   0. `[writable]` Gumball Machine account
    ///   1. `[writable]` Authority PDA (PDA, seeds: ["authority", jellybean_machine])
    ///   2. `[signer, writable]` Authority
    ///   3. `[signer, writable]` Payer for account reallocation
    ///   4. `[writable]` Asset account (optional)
    ///   5. `[writable, optional]` Collection account
    ///   6. `[]` MPL Core program
    ///   7. `[]` System program
    pub fn add_core_item(ctx: Context<AddCoreItem>) -> Result<()> {
        instructions::add_core_item(ctx)
    }

    /// Remove Core asset from the jellybean machine.
    /// Thaws and revokes delegate from the seller's asset and removes it from the config lines.
    /// The signer can be the Gumball Machine authority or the seller of the specific item.
    ///
    /// # Accounts
    ///
    ///   0. `[writable]` Gumball Machine account.
    ///   1. `[writable]` Seller history account (PDA, seeds: ["seller_history", jellybean_machine, seller]).
    ///   2. `[writable]` Authority PDA (PDA, seeds: ["authority", jellybean_machine]).
    ///   3. `[signer]` Authority allowed to remove (jellybean machine authority or item seller).
    ///   4. `[writable]` Seller account (owner of the asset).
    ///   5. `[writable]` Asset account.
    ///   6. `[writable, optional]` Collection account if asset is part of one.
    ///   7. `[]` MPL Core program.
    ///   8. `[]` System program.
    pub fn remove_core_item(ctx: Context<RemoveCoreItem>, index: u8) -> Result<()> {
        instructions::remove_core_item(ctx, index)
    }

    /// Allows minting to begin.
    ///
    /// # Accounts
    ///
    ///   0. `[writable]` Gumball Machine account
    ///   1. `[signer]` Gumball Machine authority (authority or mint_authority)
    pub fn start_sale(ctx: Context<StartSale>) -> Result<()> {
        instructions::start_sale(ctx)
    }

    /// Disables minting and allows sales to be settled.
    ///
    /// # Accounts
    ///
    ///   0. `[writable]` Gumball Machine account
    ///   1. `[signer, writable]` Gumball Machine authority
    pub fn end_sale(ctx: Context<EndSale>) -> Result<()> {
        instructions::end_sale(ctx)
    }

    /// Draw for a random item from the jellybean machine.
    /// Only the jellybean machine mint authority is allowed to draw.
    ///
    /// # Accounts
    ///
    ///   0. `[writable]` Gumball Machine account
    ///   1. `[signer]` Gumball Machine mint authority
    ///   2. `[signer, writable]` Payer
    ///   3. `[]` Buyer account
    ///   4. `[]` System program
    ///   5. `[]` SlotHashes sysvar cluster data
    pub fn draw<'info>(ctx: Context<'_, '_, '_, 'info, Draw<'info>>) -> Result<()> {
        instructions::draw(ctx)
    }

    /// Claims a Core asset from the jellybean machine for a specific buyer.
    /// Transfers the asset from the PDA to the buyer.
    ///
    /// # Accounts
    ///
    ///   0. `[signer, writable]` Payer (anyone can claim the item)
    ///   1. `[writable]` Gumball Machine account (must be in SaleLive or SaleEnded state)
    ///   2. `[writable]` Authority PDA (PDA, seeds: ["authority", jellybean_machine])
    ///   3. `[writable]` Seller account
    ///   4. `[]` Buyer account
    ///   5. `[]` System program
    ///   6. `[writable]` Asset account
    ///   7. `[writable, optional]` Collection account if asset is part of one.
    ///   8. `[]` MPL Core program.
    pub fn claim_core_item<'info>(
        ctx: Context<'_, '_, '_, 'info, ClaimCoreItem<'info>>,
        index: u8,
    ) -> Result<()> {
        instructions::claim_core_item(ctx, index)
    }

    /// Set a new mint authority of the jellybean machine.
    ///
    /// # Accounts
    ///
    ///   0. `[writable]` Gumball Machine account
    ///   1. `[signer]` Gumball Machine authority
    ///   2. `[signer]` New jellybean machine authority
    pub fn set_mint_authority(ctx: Context<SetMintAuthority>) -> Result<()> {
        instructions::set_mint_authority(ctx)
    }

    /// Withdraw the rent lamports and send them to the authority address.
    /// If a non-native payment mint was used, also closes the PDA payment token account,
    /// sending its balance to the authority's associated token account.
    ///
    /// # Accounts
    ///
    ///   0. `[writable]` Gumball Machine account (will be closed)
    ///   1. `[signer, writable]` Gumball Machine authority
    ///   2. `[signer, writable]` Gumball Machine mint authority
    ///   3. `[writable]` Authority PDA (PDA, seeds: ["authority", jellybean_machine])
    ///   4. `[writable, optional]` Authority PDA payment account
    ///   5. `[]` Token program
    ///   Remaining accounts (if closing non-native payment account):
    ///     - `[]` Payment Mint
    ///     - `[writable]` Authority's token account for payment mint
    ///     - `[]` Associated Token program
    ///     - `[]` System program
    ///     - `[]` Rent sysvar
    pub fn withdraw<'info>(ctx: Context<'_, '_, '_, 'info, Withdraw<'info>>) -> Result<()> {
        instructions::withdraw(ctx)
    }
}
