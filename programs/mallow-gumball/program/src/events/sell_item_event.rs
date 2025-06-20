use anchor_lang::prelude::*;
use solana_program::pubkey::Pubkey;

use crate::TokenStandard;

#[event]
pub struct SellItemEvent {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub token_standard: TokenStandard,
}
