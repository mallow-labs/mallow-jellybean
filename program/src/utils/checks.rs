use crate::JellybeanError;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::{IsInitialized, Pack};
use anchor_lang::solana_program::{account_info::AccountInfo, pubkey::Pubkey};
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::spl_token::{native_mint, state::Account as SplAccount, ID as SPL_TOKEN_ID};

pub fn is_native_mint(key: Pubkey) -> bool {
    return key == native_mint::ID;
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
