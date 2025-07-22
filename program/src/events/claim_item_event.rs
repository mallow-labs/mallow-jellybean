use anchor_lang::prelude::*;
use solana_program::pubkey::Pubkey;

#[event]
pub struct ClaimItemEvent {
    pub authority: Pubkey,
}
