use super::claim_item;
use crate::{JellybeanError, JellybeanMachine};
use anchor_lang::prelude::*;
use mpl_core::instructions::TransferV1CpiBuilder;

pub fn claim_core_asset<'a, 'b>(
    jellybean_machine: &mut Box<Account<'a, JellybeanMachine>>,
    index: u32,
    authority_pda: &AccountInfo<'a>,
    payer: &AccountInfo<'a>,
    to: &AccountInfo<'a>,
    from: &AccountInfo<'a>,
    asset: &AccountInfo<'a>,
    collection: Option<&AccountInfo<'a>>,
    mpl_core_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    auth_seeds: &[&[u8]],
) -> Result<()> {
    claim_item(jellybean_machine, index)?;

    require!(to.key() != Pubkey::default(), JellybeanError::InvalidTo);

    TransferV1CpiBuilder::new(mpl_core_program)
        .asset(asset)
        .collection(collection)
        .payer(payer)
        .authority(Some(authority_pda))
        .new_owner(to)
        .system_program(Some(system_program))
        .invoke_signed(&[&auth_seeds])?;

    Ok(())
}
