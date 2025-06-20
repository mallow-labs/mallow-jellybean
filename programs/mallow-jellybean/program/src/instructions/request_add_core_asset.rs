use crate::{
    approve_and_freeze_core_asset, assert_can_request_add_item,
    constants::{ADD_ITEM_REQUEST_SEED, AUTHORITY_SEED, SELLER_HISTORY_SEED},
    state::GumballMachine,
    AddItemRequest, GumballError, SellerHistory, TokenStandard,
};
use anchor_lang::prelude::*;

/// Request to add a core asset to a gumball machine.
#[derive(Accounts)]
pub struct RequestAddCoreAsset<'info> {
    /// Gumball Machine account.
    #[account(
        mut,
        constraint = gumball_machine.can_edit_items() @ GumballError::InvalidState,
    )]
    gumball_machine: Box<Account<'info, GumballMachine>>,

    /// Seller history account.
    #[account(
		init_if_needed,
		seeds = [
			SELLER_HISTORY_SEED.as_bytes(),
			gumball_machine.key().as_ref(),
            seller.key().as_ref(),
		],
		bump,
		space = SellerHistory::SPACE,
		payer = seller
	)]
    seller_history: Box<Account<'info, SellerHistory>>,

    /// Add item request account.
    #[account(
        init,
        seeds = [
            ADD_ITEM_REQUEST_SEED.as_bytes(), 
            asset.key().as_ref()
        ],
        bump,
        space = AddItemRequest::SPACE,
        payer = seller
    )]
    add_item_request: Box<Account<'info, AddItemRequest>>,

    /// CHECK: Safe due to seeds constraint
    #[account(
        mut,
        seeds = [
            AUTHORITY_SEED.as_bytes(), 
            gumball_machine.key().as_ref()
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

pub fn request_add_core_asset(ctx: Context<RequestAddCoreAsset>) -> Result<()> {
    let asset_info = &ctx.accounts.asset.to_account_info();
    let seller = &ctx.accounts.seller.to_account_info();
    let mpl_core_program = &ctx.accounts.mpl_core_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let seller_history = &mut ctx.accounts.seller_history;
    let add_item_request = &mut ctx.accounts.add_item_request;

    add_item_request.init(
        gumball_machine.key(),
        seller.key(),
        ctx.accounts.asset.key(),
        TokenStandard::Core,
    )?;

    seller_history.gumball_machine = gumball_machine.key();
    seller_history.seller = seller.key();

    // Validate the seller
    assert_can_request_add_item(gumball_machine, seller_history)?;

    seller_history.item_count += 1;

    let collection_info = ctx
        .accounts
        .collection
        .as_ref()
        .map(|account| account.to_account_info());
    let collection = collection_info.as_ref();

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        ctx.accounts.gumball_machine.to_account_info().key.as_ref(),
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
