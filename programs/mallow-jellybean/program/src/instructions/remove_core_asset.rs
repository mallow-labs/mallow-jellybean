use crate::{
    constants::{AUTHORITY_SEED},
    processors,
    state::JellybeanMachine,
    thaw_and_revoke_core_asset,
    JellybeanError,
};
use anchor_lang::prelude::*;

/// Remove core asset from a gumball machine.
#[derive(Accounts)]
pub struct RemoveCoreItem<'info> {
    /// Gumball Machine account.
    #[account(
        mut,
        has_one = authority @ JellybeanError::InvalidAuthority,
        constraint = jellybean_machine.can_edit_items() @ JellybeanError::InvalidState,
    )]
    jellybean_machine: Account<'info, JellybeanMachine>,

    /// CHECK: Safe due to seeds constraint
    #[account(
        mut,
        seeds = [
            AUTHORITY_SEED.as_bytes(), 
            jellybean_machine.key().as_ref()
        ],
        bump
    )]
    authority_pda: UncheckedAccount<'info>,

    /// Authority of the jellybean machine.
    #[account(mut)]
    authority: Signer<'info>,

    /// CHECK: Safe due to freeze
    #[account(mut)]
    asset: Option<UncheckedAccount<'info>>,

    /// Core asset's collection if it's part of one.
    /// CHECK: Verified in mpl_core processors
    #[account(mut)]
    collection: Option<UncheckedAccount<'info>>,

    /// CHECK: Safe due to address constraint
    #[account(address = mpl_core::ID)]
    mpl_core_program: UncheckedAccount<'info>,

    system_program: Program<'info, System>,
}

pub fn remove_core_item(ctx: Context<RemoveCoreItem>, index: u32) -> Result<()> {
    let authority = &ctx.accounts.authority.to_account_info();
    let mpl_core_program = &ctx.accounts.mpl_core_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let authority_pda = &ctx.accounts.authority_pda.to_account_info();
    let jellybean_machine = &mut ctx.accounts.jellybean_machine;

    // Remove the item from the jellybean machine
    processors::remove_multiple_items_span(
        jellybean_machine,
        index,
        index,
        authority,
        system_program,
    )?;

    // Handle asset transfer back to owner if asset is provided
    if let Some(asset) = &ctx.accounts.asset {
        let collection_info = ctx
            .accounts
            .collection
            .as_ref()
            .map(|account| account.to_account_info());
        let collection = collection_info.as_ref();

        let auth_seeds = [
            AUTHORITY_SEED.as_bytes(),
            ctx.accounts.jellybean_machine.to_account_info().key.as_ref(),
            &[ctx.bumps.authority_pda],
        ];

        thaw_and_revoke_core_asset(
            authority,
            authority, // Owner is the authority in this case
            &asset.to_account_info(),
            collection,
            authority_pda,
            &auth_seeds,
            mpl_core_program,
            system_program,
        )?;
    }

    Ok(())
}
