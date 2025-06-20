use anchor_lang::prelude::*;

use crate::TokenStandard;

/// Add item request state.
#[account]
#[derive(Debug)]
pub struct AddItemRequest {
    /// Gumball machine address.
    pub gumball_machine: Pubkey,
    /// Seller address.
    pub seller: Pubkey,
    /// Asset address.
    pub asset: Pubkey,
    /// Token standard.
    pub token_standard: TokenStandard,
}

impl AddItemRequest {
    // Additional padding for future proofing
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1;

    pub fn init(
        &mut self,
        gumball_machine: Pubkey,
        seller: Pubkey,
        asset: Pubkey,
        token_standard: TokenStandard,
    ) -> Result<()> {
        self.gumball_machine = gumball_machine;
        self.seller = seller;
        self.asset = asset;
        self.token_standard = token_standard;
        Ok(())
    }
}
