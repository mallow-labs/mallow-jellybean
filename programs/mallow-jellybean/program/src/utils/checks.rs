use crate::error::Error;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;
use mpl_token_metadata::accounts::Metadata;
use solana_program::program_pack::{IsInitialized, Pack};
use solana_program::{account_info::AccountInfo, pubkey::Pubkey};
use spl_token::state::Account as SplAccount;

pub fn is_native_mint(key: Pubkey) -> bool {
    return key == spl_token::native_mint::ID;
}

pub fn assert_keys_equal(key1: Pubkey, key2: Pubkey, error_message: &str) -> Result<()> {
    if key1 != key2 {
        msg!("{}: actual: {} expected: {}", error_message, key1, key2);
        return err!(Error::PublicKeyMismatch);
    }

    Ok(())
}

pub fn assert_is_ata(ata: &AccountInfo, wallet: &Pubkey, mint: &Pubkey) -> Result<SplAccount> {
    assert_owned_by(ata, &spl_token::id())?;
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
        err!(Error::InvalidOwner)
    } else {
        Ok(())
    }
}

pub fn assert_initialized<T: Pack + IsInitialized>(account_info: &AccountInfo) -> Result<T> {
    let account: T = T::unpack_unchecked(&account_info.data.borrow())?;
    if !account.is_initialized() {
        err!(Error::UninitializedAccount)
    } else {
        Ok(account)
    }
}

pub fn assert_is_metadata_account(metadata_account: Pubkey, mint: Pubkey) -> Result<()> {
    let (expected_metadata_account, _bump) = Metadata::find_pda(&mint);

    assert_keys_equal(
        metadata_account,
        expected_metadata_account,
        "Invalid metadata account",
    )?;

    Ok(())
}

/// Returns true if a `leaf` can be proved to be a part of a Merkle tree
/// defined by `root`. For this, a `proof` must be provided, containing
/// sibling hashes on the branch from the leaf to the root of the tree. Each
/// pair of leaves and each pair of pre-images are assumed to be sorted.
pub fn verify_proof(proof: &[[u8; 32]], root: &[u8; 32], leaf: &[u8; 32]) -> bool {
    let mut computed_hash = *leaf;
    for proof_element in proof.iter() {
        if computed_hash <= *proof_element {
            // hash (current computed hash + current element of the proof)
            computed_hash = solana_program::keccak::hashv(&[&computed_hash, proof_element]).0
        } else {
            // hash (current element of the proof + current computed hash)
            computed_hash = solana_program::keccak::hashv(&[proof_element, &computed_hash]).0;
        }
    }
    // check if the computed hash (root) is equal to the provided root
    computed_hash == *root
}
