use anchor_lang::prelude::*;

#[error_code]
pub enum GumballError {
    #[msg("Account does not have correct owner")]
    IncorrectOwner,

    #[msg("Account is not initialized")]
    Uninitialized,

    #[msg("Mint Mismatch")]
    MintMismatch,

    #[msg("Index greater than length")]
    IndexGreaterThanLength,

    #[msg("Numerical overflow error")]
    NumericalOverflowError,

    #[msg("Can only provide up to 4 creators to gumball machine (because gumball machine is one)")]
    TooManyCreators,

    #[msg("Gumball machine is empty")]
    GumballMachineEmpty,

    #[msg("Gumball machines using hidden uris do not have config lines, they have a single hash representing hashed order")]
    HiddenSettingsDoNotHaveConfigLines,

    #[msg("Cannot change number of lines unless is a hidden config")]
    CannotChangeNumberOfLines,

    #[msg("Cannot switch to hidden settings after items available is greater than 0")]
    CannotSwitchToHiddenSettings,

    #[msg("Incorrect collection NFT authority")]
    IncorrectCollectionAuthority,

    #[msg("The metadata account has data in it, and this must be empty to mint a new NFT")]
    MetadataAccountMustBeEmpty,

    #[msg("Can't change collection settings after items have begun to be minted")]
    NoChangingCollectionDuringMint,

    #[msg("Value longer than expected maximum value")]
    ExceededLengthError,

    #[msg("Missing config lines settings")]
    MissingConfigLinesSettings,

    #[msg("Cannot increase the length in config lines settings")]
    CannotIncreaseLength,

    #[msg("Cannot switch from hidden settings")]
    CannotSwitchFromHiddenSettings,

    #[msg("Cannot change sequential index generation after items have begun to be minted")]
    CannotChangeSequentialIndexGeneration,

    #[msg("Collection public key mismatch")]
    CollectionKeyMismatch,

    #[msg("Could not retrive config line data")]
    CouldNotRetrieveConfigLineData,

    #[msg("Not all config lines were added to the gumball machine")]
    NotFullyLoaded,

    #[msg("Instruction could not be created")]
    InstructionBuilderFailed,

    #[msg("Missing collection authority record")]
    MissingCollectionAuthorityRecord,

    #[msg("Missing metadata delegate record")]
    MissingMetadataDelegateRecord,

    #[msg("Invalid token standard")]
    InvalidTokenStandard,

    #[msg("Missing token account")]
    MissingTokenAccount,

    #[msg("Missing token record")]
    MissingTokenRecord,

    #[msg("Missing instructions sysvar account")]
    MissingInstructionsSysvar,

    #[msg("Missing SPL ATA program")]
    MissingSplAtaProgram,

    #[msg("Invalid account version")]
    InvalidAccountVersion,

    #[msg("Not a primary sale asset")]
    NotPrimarySale,

    #[msg("Invalid edition account")]
    InvalidEditionAccount,

    #[msg("Invalid master edition supply")]
    InvalidMasterEditionSupply,

    #[msg("Public key mismatch")]
    PublicKeyMismatch,

    #[msg("Invalid collection")]
    InvalidCollection,

    #[msg("Gumball machine detailed finalized")]
    GumballMachineDetailsFinalized,

    #[msg("Invalid state")]
    InvalidState,

    #[msg("Invalid authority")]
    InvalidAuthority,

    #[msg("Invalid mint authority")]
    InvalidMintAuthority,

    #[msg("Invalid mint")]
    InvalidMint,

    #[msg("Invalid payment mint")]
    InvalidPaymentMint,

    #[msg("Invalid seller")]
    InvalidSeller,

    #[msg("Invalid buyer")]
    InvalidBuyer,

    #[msg("URI too long")]
    UriTooLong,

    #[msg("Invalid proof path")]
    InvalidProofPath,

    #[msg("Invalid setting update")]
    InvalidSettingUpdate,

    #[msg("Seller has too many items")]
    SellerTooManyItems,

    #[msg("Not all items have been settled")]
    NotAllSettled,

    #[msg("Item already settled")]
    ItemAlreadySettled,

    #[msg("Item already claimed")]
    ItemAlreadyClaimed,

    #[msg("Item already drawn")]
    ItemAlreadyDrawn,

    #[msg("Invalid gumball machine")]
    InvalidGumballMachine,

    #[msg("Seller cannot be authority")]
    SellerCannotBeAuthority,

    #[msg("Asset has an invalid plugin")]
    InvalidAssetPlugin,

    #[msg("Invalid amount")]
    InvalidAmount,

    #[msg("Duplicate index")]
    DuplicateIndex,

    #[msg("Invalid input length")]
    InvalidInputLength,

    #[msg("Buy back not enabled")]
    BuyBackNotEnabled,

    #[msg("Buy back funds not zero")]
    BuyBackFundsNotZero,

    #[msg("Insufficient funds")]
    InsufficientFunds,

    #[msg("Invalid version")]
    InvalidVersion,

    #[msg("Invalid oracle signer")]
    InvalidOracleSigner,

    #[msg("Invalid payer")]
    InvalidPayer,

    #[msg("Not implemented")]
    NotImplemented,

    #[msg("Buy back cutoff reached")]
    BuyBackCutoffReached,

    #[msg("Not a solo gumball")]
    NotASoloGumball,

    #[msg("Item not claimed")]
    ItemNotClaimed,

    #[msg("Item not settled")]
    ItemNotSettled,

    #[msg("Missing item index")]
    MissingItemIndex,
}
