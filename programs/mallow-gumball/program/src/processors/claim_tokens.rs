use crate::{processors::claim_item, transfer_and_close_if_empty, GumballError, GumballMachine};
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

pub fn claim_tokens<'a, 'b>(
    gumball_machine: &mut Box<Account<'a, GumballMachine>>,
    index: u32,
    authority: &AccountInfo<'a>,
    authority_pda: &AccountInfo<'a>,
    payer: &AccountInfo<'a>,
    to: &AccountInfo<'a>,
    to_token_account: &AccountInfo<'a>,
    authority_pda_token_account: &mut Box<Account<'a, TokenAccount>>,
    mint: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    associated_token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    rent: &AccountInfo<'a>,
    auth_seeds: &[&[u8]],
) -> Result<u64> {
    let amount = claim_item(gumball_machine, index)?;

    require!(
        to.key() != Pubkey::default(),
        GumballError::InvalidAuthority
    );

    transfer_and_close_if_empty(
        payer,
        authority_pda,
        authority_pda_token_account,
        to,
        to_token_account,
        mint,
        token_program,
        associated_token_program,
        system_program,
        rent,
        authority,
        auth_seeds,
        amount,
    )?;

    Ok(amount)
}
