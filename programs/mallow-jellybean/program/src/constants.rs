use mpl_core::types::Creator;
pub use mpl_token_metadata::MAX_URI_LENGTH;

// Seed used to derive the authority PDA address.
pub const AUTHORITY_SEED: &str = "jellybean_machine";

pub const BASE_JELLYBEAN_MACHINE_SIZE: usize = 8 // discriminator
    + 1                                       // version
    + 32                                      // authority
    + 32                                      // mint authority
    + 5 * size_of::<Creator>()                 // fee splits
    + 2                                       // items loaded
    + 8                                       // supply loaded
    + 8                                       // supply redeemed
    + 8                                       // supply settled
    + 1 // state
    + MAX_URI_LENGTH // uri
    + 320; // padding
