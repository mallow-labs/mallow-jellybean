use std::slice::Iter;

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    program::{invoke, invoke_signed},
    system_instruction,
};
use anchor_spl::token::{self, Transfer};
use spl_associated_token_account::instruction::create_associated_token_account;

use crate::{assert_is_ata, assert_keys_equal, FeeAccount, JellybeanError, MAX_FEE_ACCOUNTS};

/// Pays creator fees to the creators in the metadata and returns total paid
pub fn pay_fee_accounts<'a>(
    payer: &mut AccountInfo<'a>,
    authority_pda: &mut AccountInfo<'a>,
    payment_mint: Option<&AccountInfo<'a>>,
    fee_accounts: &[Option<FeeAccount>; MAX_FEE_ACCOUNTS],
    remaining_accounts: &mut Iter<AccountInfo<'a>>,
    associated_token_program: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    rent: &AccountInfo<'a>,
    auth_seeds: &[&[u8]],
    amount: u64,
) -> Result<u64> {
    let is_native = payment_mint.is_none();

    let authority_pda_token_account = if payment_mint.is_some() {
        Some(next_account_info(remaining_accounts)?)
    } else {
        None
    };

    let mut total_paid = 0;
    for fee_account in fee_accounts {
        if fee_account.is_none() {
            continue;
        }

        let fee_account = fee_account.unwrap();
        if fee_account.basis_points == 0 {
            continue;
        }

        let fee_amount = (fee_account.basis_points as u128)
            .checked_mul(amount as u128)
            .ok_or(JellybeanError::NumericalOverflowError)?
            .checked_div(10000)
            .ok_or(JellybeanError::NumericalOverflowError)? as u64;

        let current_fee_account = next_account_info(remaining_accounts)?;
        assert_keys_equal(
            fee_account.address,
            current_fee_account.key(),
            "Invalid fee account key",
        )?;

        let fee_token_account = if is_native {
            None
        } else {
            Some(next_account_info(remaining_accounts)?)
        };

        transfer_from_pda(
            authority_pda,
            &mut current_fee_account.to_account_info(),
            authority_pda_token_account,
            fee_token_account,
            payment_mint,
            payer,
            associated_token_program,
            token_program,
            system_program,
            rent,
            auth_seeds,
            fee_amount,
        )?;

        total_paid += fee_amount;
    }

    Ok(total_paid)
}

/// Transfers SOL or SPL tokens from a program owned account to another account.
pub fn transfer<'a>(
    authority_pda: &AccountInfo<'a>,
    to: &AccountInfo<'a>,
    authority_pda_token_account: Option<&AccountInfo<'a>>,
    to_token_account: Option<&AccountInfo<'a>>,
    payment_mint: Option<&AccountInfo<'a>>,
    payer: &AccountInfo<'a>,
    associated_token_program: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    rent: Option<&AccountInfo<'a>>,
    auth_seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    if payment_mint.is_none() {
        transfer_sol(authority_pda, to, system_program, auth_seeds, amount)?;
    } else {
        transfer_spl(
            authority_pda,
            to,
            authority_pda_token_account.unwrap(),
            to_token_account.unwrap(),
            payment_mint.unwrap(),
            payer,
            associated_token_program,
            token_program,
            system_program,
            rent.unwrap(),
            auth_seeds,
            amount,
        )?;
    }

    Ok(())
}

/// Transfers SOL or SPL tokens from a program owned account to another account.
pub fn transfer_from_pda<'a>(
    authority_pda: &mut AccountInfo<'a>,
    to: &mut AccountInfo<'a>,
    authority_pda_token_account: Option<&AccountInfo<'a>>,
    to_token_account: Option<&AccountInfo<'a>>,
    payment_mint: Option<&AccountInfo<'a>>,
    payer: &AccountInfo<'a>,
    associated_token_program: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    rent: &AccountInfo<'a>,
    auth_seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    if payment_mint.is_none() {
        transfer_sol_from_pda(authority_pda, to, amount)?;
    } else {
        transfer_spl(
            authority_pda,
            to,
            authority_pda_token_account.unwrap(),
            to_token_account.unwrap(),
            payment_mint.unwrap(),
            payer,
            associated_token_program,
            token_program,
            system_program,
            rent,
            auth_seeds,
            amount,
        )?;
    }

    Ok(())
}

pub fn transfer_sol_from_pda(
    src: &mut AccountInfo,
    dst: &mut AccountInfo,
    amount: u64,
) -> Result<()> {
    **src.try_borrow_mut_lamports()? = src
        .lamports()
        .checked_sub(amount)
        .ok_or(JellybeanError::NumericalOverflowError)?;
    **dst.try_borrow_mut_lamports()? = dst
        .lamports()
        .checked_add(amount)
        .ok_or(JellybeanError::NumericalOverflowError)?;
    Ok(())
}

pub fn transfer_sol<'a>(
    from: &AccountInfo<'a>,
    to: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    auth_seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    let transfer_ix = &system_instruction::transfer(from.key, to.key, amount);
    let transfer_accounts = &[from.clone(), to.clone(), system_program.clone()];

    invoke_signed(transfer_ix, transfer_accounts, &[auth_seeds])?;

    Ok(())
}

pub fn transfer_spl<'a>(
    authority_pda: &AccountInfo<'a>,
    to: &AccountInfo<'a>,
    authority_pda_token_account: &AccountInfo<'a>,
    to_token_account: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    payer: &AccountInfo<'a>,
    associated_token_program: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    rent: &AccountInfo<'a>,
    auth_seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

    ensure_ata(
        to_token_account,
        to,
        mint,
        payer,
        associated_token_program,
        token_program,
        system_program,
        rent,
    )?;

    let transfer_cpi = CpiContext::new(
        token_program.to_account_info(),
        Transfer {
            from: authority_pda_token_account.to_account_info(),
            to: to_token_account.to_account_info(),
            authority: authority_pda.to_account_info(),
        },
    );

    token::transfer(transfer_cpi.with_signer(&[auth_seeds]), amount)?;

    Ok(())
}

pub fn ensure_ata<'b>(
    to_token_account: &AccountInfo<'b>,
    to: &AccountInfo<'b>,
    mint: &AccountInfo<'b>,
    funding_address: &AccountInfo<'b>,
    associated_token_program: &AccountInfo<'b>,
    token_program: &AccountInfo<'b>,
    system_program: &AccountInfo<'b>,
    rent: &AccountInfo<'b>,
) -> Result<()> {
    if to_token_account.data_is_empty() {
        make_ata(
            to_token_account.to_account_info(),
            to.to_account_info(),
            mint.to_account_info(),
            funding_address.to_account_info(),
            associated_token_program.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            rent.to_account_info(),
        )?;
    } else {
        assert_is_ata(to_token_account, to.key, &mint.key())?;
    }

    Ok(())
}

pub fn make_ata<'a>(
    ata: AccountInfo<'a>,
    wallet: AccountInfo<'a>,
    mint: AccountInfo<'a>,
    funding_address: AccountInfo<'a>,
    associated_token_program: AccountInfo<'a>,
    token_program: AccountInfo<'a>,
    system_program: AccountInfo<'a>,
    rent: AccountInfo<'a>,
) -> Result<()> {
    let ix = &create_associated_token_account(
        funding_address.key,
        wallet.key,
        mint.key,
        token_program.key,
    );

    let accounts = &[
        ata,
        wallet,
        mint,
        funding_address,
        associated_token_program,
        system_program,
        rent,
        token_program,
    ];

    invoke(ix, accounts)?;

    Ok(())
}
