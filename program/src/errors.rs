use anchor_lang::prelude::*;

#[error_code]
pub enum JellybeanError {
    #[msg("Invalid public key")]
    PublicKeyMismatch,
    #[msg("Invalid owner")]
    InvalidOwner,
    #[msg("Account not initialized")]
    UninitializedAccount,
    #[msg("Index greater than length")]
    IndexGreaterThanLength,
    #[msg("Numerical overflow error")]
    NumericalOverflowError,
    #[msg("Jellybean machine is empty")]
    JellybeanMachineEmpty,
    #[msg("Invalid state")]
    InvalidState,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Invalid mint authority")]
    InvalidMintAuthority,
    #[msg("Invalid buyer")]
    InvalidBuyer,
    #[msg("URI too long")]
    UriTooLong,
    #[msg("Not all items have been settled")]
    NotAllSettled,
    #[msg("Invalid jellybean machine")]
    InvalidJellybeanMachine,
    #[msg("Invalid asset")]
    InvalidAsset,
    #[msg("Master edition not empty")]
    MasterEditionNotEmpty,
    #[msg("Invalid master edition supply")]
    InvalidMasterEditionSupply,
    #[msg("Missing master edition")]
    MissingMasterEdition,
    #[msg("Missing print asset")]
    MissingPrintAsset,
    #[msg("Invalid input length")]
    InvalidInputLength,
    #[msg("Invalid item index")]
    InvalidItemIndex,
    #[msg("Fee account basis points must sum to 10000")]
    InvalidFeeAccountBasisPoints,
}
