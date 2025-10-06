use crate::{FeeAccount, JellybeanError, SettingsArgs, MAX_FEE_ACCOUNTS, MAX_URI_LENGTH};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::{IsInitialized, Pack};
use anchor_lang::solana_program::{account_info::AccountInfo, pubkey::Pubkey};
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::spl_token::{native_mint, state::Account as SplAccount, ID as SPL_TOKEN_ID};

pub fn is_native_mint(key: Pubkey) -> bool {
    key == native_mint::ID
}

pub fn assert_keys_equal(key1: Pubkey, key2: Pubkey, error_message: &str) -> Result<()> {
    if key1 != key2 {
        msg!("{}: actual: {} expected: {}", error_message, key1, key2);
        return err!(JellybeanError::PublicKeyMismatch);
    }

    Ok(())
}

pub fn assert_is_ata(ata: &AccountInfo, wallet: &Pubkey, mint: &Pubkey) -> Result<SplAccount> {
    assert_owned_by(ata, &SPL_TOKEN_ID)?;
    let ata_account: SplAccount = assert_initialized(ata)?;
    assert_keys_equal(ata_account.owner, *wallet, "Invalid ATA owner")?;
    assert_keys_equal(ata_account.mint, *mint, "Invalid ATA mint")?;
    assert_keys_equal(
        get_associated_token_address(wallet, mint),
        *ata.key,
        "Invalid ATA address",
    )?;
    Ok(ata_account)
}

pub fn assert_owned_by(account: &AccountInfo, owner: &Pubkey) -> Result<()> {
    if account.owner != owner {
        err!(JellybeanError::InvalidOwner)
    } else {
        Ok(())
    }
}

pub fn assert_initialized<T: Pack + IsInitialized>(account_info: &AccountInfo) -> Result<T> {
    let account: T = T::unpack_unchecked(&account_info.data.borrow())?;
    if !account.is_initialized() {
        err!(JellybeanError::UninitializedAccount)
    } else {
        Ok(account)
    }
}

/// Validates URI length
pub fn validate_uri_length(uri: &str) -> Result<()> {
    if uri.len() > MAX_URI_LENGTH - 4 {
        return err!(JellybeanError::UriTooLong);
    }
    Ok(())
}

/// Validates fee account basis points
pub fn validate_fee_accounts(fee_accounts: &[FeeAccount]) -> Result<()> {
    if fee_accounts.len() > MAX_FEE_ACCOUNTS {
        return err!(JellybeanError::TooManyFeeAccounts);
    }

    let mut total_basis_points: u16 = 0;

    for account in fee_accounts.iter() {
        total_basis_points = total_basis_points
            .checked_add(account.basis_points)
            .ok_or(JellybeanError::InvalidFeeAccountBasisPoints)?;
    }

    // Only validate if there are any fee accounts
    if fee_accounts.len() > 0 && total_basis_points != 10000 {
        return err!(JellybeanError::InvalidFeeAccountBasisPoints);
    }

    Ok(())
}

/// Validates settings arguments (URI length and fee accounts)
pub fn validate_settings_args(args: &SettingsArgs) -> Result<()> {
    validate_uri_length(&args.uri)?;
    validate_fee_accounts(&args.fee_accounts)?;
    Ok(())
}
