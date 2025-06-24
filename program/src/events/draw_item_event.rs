use anchor_lang::prelude::*;
use solana_program::pubkey::Pubkey;

#[event]
pub struct DrawItemEvent {
    pub authority: Pubkey,
    pub index: u32,
}
