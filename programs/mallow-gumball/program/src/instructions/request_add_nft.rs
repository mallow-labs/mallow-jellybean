use crate::{
    approve_and_freeze_nft_v2, assert_can_request_add_item,
    constants::{
        ADD_ITEM_REQUEST_SEED, AUTHORITY_SEED, MPL_TOKEN_AUTH_RULES_PROGRAM, SELLER_HISTORY_SEED,
    },
    state::GumballMachine,
    token_standard_from_mpl_token_standard, AddItemRequest, GumballError, SellerHistory, Token,
};
use anchor_lang::prelude::*;
use mpl_token_metadata::accounts::Metadata;

/// Add nft to a gumball machine.
#[derive(Accounts)]
pub struct RequestAddNft<'info> {
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
            mint.key().as_ref()
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

    /// Seller of the nft
    #[account(mut)]
    seller: Signer<'info>,

    /// CHECK: Safe due to freeze
    mint: UncheckedAccount<'info>,

    /// CHECK: Safe due to freeze
    #[account(mut)]
    token_account: UncheckedAccount<'info>,

    /// CHECK: Safe due to processor mint check
    #[account(mut)]
    metadata: UncheckedAccount<'info>,

    /// CHECK: Safe due to freeze
    edition: UncheckedAccount<'info>,

    token_program: Program<'info, Token>,

    /// CHECK: Safe due to constraint
    #[account(address = mpl_token_metadata::ID)]
    token_metadata_program: UncheckedAccount<'info>,

    system_program: Program<'info, System>,

    /// OPTIONAL PNFT ACCOUNTS
    /// CHECK: Safe due to token metadata program check
    #[account(mut)]
    pub seller_token_record: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to token metadata program check
    pub auth_rules: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to address check
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to address check
    #[account(address = MPL_TOKEN_AUTH_RULES_PROGRAM)]
    pub auth_rules_program: Option<UncheckedAccount<'info>>,
}

pub fn request_add_nft(ctx: Context<RequestAddNft>) -> Result<()> {
    let token_program = &ctx.accounts.token_program.to_account_info();
    let token_account = &ctx.accounts.token_account.to_account_info();
    let token_metadata_program = &ctx.accounts.token_metadata_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let authority_pda = &ctx.accounts.authority_pda.to_account_info();
    let seller = &ctx.accounts.seller.to_account_info();
    let metadata_account = &ctx.accounts.metadata.to_account_info();
    let edition = &ctx.accounts.edition.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let seller_history = &mut ctx.accounts.seller_history;
    let add_item_request = &mut ctx.accounts.add_item_request;

    // Validate that the metadata is for the correct mint
    let metadata = Metadata::try_from(metadata_account)?;
    require!(
        metadata.mint == ctx.accounts.mint.key(),
        GumballError::MintMismatch
    );

    add_item_request.init(
        gumball_machine.key(),
        seller.key(),
        ctx.accounts.mint.key(),
        token_standard_from_mpl_token_standard(&metadata)?,
    )?;

    seller_history.gumball_machine = gumball_machine.key();
    seller_history.seller = seller.key();

    // Validate the seller
    assert_can_request_add_item(gumball_machine, seller_history)?;

    seller_history.item_count += 1;

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        ctx.accounts.gumball_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    let metadata = &Metadata::try_from(metadata_account)?;
    approve_and_freeze_nft_v2(
        seller,
        seller,
        mint,
        token_account,
        edition,
        authority_pda,
        &auth_seeds,
        token_metadata_program,
        token_program,
        metadata_account,
        metadata,
        ctx.accounts.seller_token_record.as_ref(),
        ctx.accounts.auth_rules.as_ref(),
        system_program,
        ctx.accounts.instructions.as_ref(),
        ctx.accounts.auth_rules_program.as_ref(),
    )?;

    Ok(())
}
