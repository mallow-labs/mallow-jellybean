use crate::{
    constants::{ADD_ITEM_REQUEST_SEED, AUTHORITY_SEED, SELLER_HISTORY_SEED},
    thaw_and_revoke_core_asset, AddItemRequest, GumballError, SellerHistory,
};
use anchor_lang::prelude::*;

/// Add core asset to a gumball machine.
#[derive(Accounts)]
pub struct CancelAddCoreAssetRequest<'info> {
    /// Seller history account.
    #[account(
		mut,
		seeds = [
			SELLER_HISTORY_SEED.as_bytes(),
			seller_history.gumball_machine.as_ref(),
            seller.key().as_ref(),
		],
		bump,
        has_one = seller,
	)]
    seller_history: Box<Account<'info, SellerHistory>>,

    /// Add item request account.
    #[account(
        mut,
        close = seller,
        seeds = [
            ADD_ITEM_REQUEST_SEED.as_bytes(), 
            asset.key().as_ref()
        ],
        bump,
        has_one = seller @ GumballError::InvalidSeller,
        has_one = asset @ GumballError::InvalidMint,
    )]
    add_item_request: Box<Account<'info, AddItemRequest>>,

    /// CHECK: Safe due to seeds constraint
    #[account(
        mut,
        seeds = [
            AUTHORITY_SEED.as_bytes(), 
            add_item_request.gumball_machine.key().as_ref()
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

pub fn cancel_add_core_asset_request(ctx: Context<CancelAddCoreAssetRequest>) -> Result<()> {
    let asset_info = &ctx.accounts.asset.to_account_info();
    let mpl_core_program = &ctx.accounts.mpl_core_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let authority_pda = &ctx.accounts.authority_pda.to_account_info();
    let seller = &ctx.accounts.seller.to_account_info();
    let seller_history = &mut ctx.accounts.seller_history;

    let collection_info = ctx
        .accounts
        .collection
        .as_ref()
        .map(|account| account.to_account_info());
    let collection = collection_info.as_ref();

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        seller_history.gumball_machine.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    thaw_and_revoke_core_asset(
        seller,
        seller,
        asset_info,
        collection,
        authority_pda,
        &auth_seeds,
        mpl_core_program,
        system_program,
    )?;

    seller_history.item_count -= 1;

    if seller_history.item_count == 0 {
        seller_history.close(seller.to_account_info())?;
    }

    Ok(())
}
