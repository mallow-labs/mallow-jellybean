use crate::{
    approve_and_freeze_core_asset, assert_can_add_item,
    constants::{AUTHORITY_SEED, SELLER_HISTORY_SEED},
    state::JellybeanMachine,
    LoadedItem, JellybeanError, 
};
use anchor_lang::prelude::*;

/// Add core asset to a gumball machine.
#[derive(Accounts)]
pub struct AddCoreAsset<'info> {
    /// Gumball Machine account.
    #[account(
        mut,
        constraint = jellybean_machine.can_edit_items() @ JellybeanError::InvalidState,
    )]
    jellybean_machine: Box<Account<'info, JellybeanMachine>>,

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

    /// Seller of the asset.
    #[account(mut)]
    seller: Signer<'info>,

    /// CHECK: Safe due to freeze
    #[account(mut)]
    asset: UncheckedAccount<'info>,

    /// Core asset's collection if it's part of one.
    /// CHECK: Verified in mpl_core processors
    #[account(mut)]
    collection: Option<UncheckedAccount<'info>>,

    /// CHECK: Safe due to address constraint
    #[account(address = mpl_core::ID)]
    mpl_core_program: UncheckedAccount<'info>,

    system_program: Program<'info, System>,
}

pub fn add_core_asset(ctx: Context<AddCoreAsset>, args: AddItemArgs) -> Result<()> {
    let asset_info = &ctx.accounts.asset.to_account_info();
    let seller = &ctx.accounts.seller.to_account_info();
    let mpl_core_program = &ctx.accounts.mpl_core_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let jellybean_machine = &mut ctx.accounts.jellybean_machine;

    // Validate the seller
    assert_can_add_item(jellybean_machine, seller_history, 1, &args)?;

    seller_history.item_count += 1;

    let collection_info = ctx
        .accounts
        .collection
        .as_ref()
        .map(|account| account.to_account_info());
    let collection = collection_info.as_ref();

    crate::processors::add_item(
        jellybean_machine,
        LoadedItem {
            mint: ctx.accounts.asset.key(),
            seller: ctx.accounts.seller.key(),
            amount: 1,
        },
        TokenStandard::Core,
        1,
        args.index,
    )?;

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        ctx.accounts.jellybean_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    approve_and_freeze_core_asset(
        seller,
        asset_info,
        collection,
        &ctx.accounts.authority_pda.to_account_info(),
        &auth_seeds,
        mpl_core_program,
        system_program,
    )?;

    Ok(())
}
