use crate::{
    constants::{AUTHORITY_SEED, MPL_TOKEN_AUTH_RULES_PROGRAM, SELLER_HISTORY_SEED},
    processors,
    state::GumballMachine,
    thaw_and_revoke_nft_v2, AssociatedToken, GumballError, SellerHistory, Token,
};
use anchor_lang::prelude::*;

/// Add nft to a gumball machine.
#[derive(Accounts)]
pub struct RemoveNft<'info> {
    /// Gumball Machine account.
    #[account(
        mut,
        constraint = gumball_machine.can_edit_items() @ GumballError::InvalidState,
    )]
    gumball_machine: Account<'info, GumballMachine>,

    /// Seller history account.
    #[account(
		mut,
		seeds = [
			SELLER_HISTORY_SEED.as_bytes(),
			gumball_machine.key().as_ref(),
            seller.key().as_ref(),
		],
		bump,
        has_one = gumball_machine,
        has_one = seller,
	)]
    seller_history: Box<Account<'info, SellerHistory>>,

    /// CHECK: Safe due to seeds constraint
    #[account(
        mut,
        seeds = [AUTHORITY_SEED.as_bytes(), gumball_machine.to_account_info().key.as_ref()],
        bump
    )]
    authority_pda: UncheckedAccount<'info>,

    /// Authority allowed to remove the nft (must be the gumball machine auth or the seller of the nft)
    authority: Signer<'info>,

    /// CHECK: Safe due to item seller check
    #[account(mut)]
    seller: UncheckedAccount<'info>,

    /// CHECK: Safe due to transfer
    mint: UncheckedAccount<'info>,

    /// CHECK: Safe due to transfer
    #[account(mut)]
    token_account: UncheckedAccount<'info>,

    /// CHECK: Safe due to transfer
    #[account(mut)]
    authority_pda_token_account: UncheckedAccount<'info>,

    /// CHECK: Safe due to thaw
    edition: UncheckedAccount<'info>,

    token_program: Program<'info, Token>,

    associated_token_program: Program<'info, AssociatedToken>,

    /// CHECK: Safe due to constraint
    #[account(address = mpl_token_metadata::ID)]
    token_metadata_program: UncheckedAccount<'info>,

    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,

    /// OPTIONAL PNFT ACCOUNTS
    /// /// CHECK: Safe due to token metadata program check
    #[account(mut)]
    pub metadata: Option<UncheckedAccount<'info>>,
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

pub fn remove_nft(ctx: Context<RemoveNft>, index: u32) -> Result<()> {
    let system_program = &ctx.accounts.system_program.to_account_info();
    let rent = &ctx.accounts.rent.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let associated_token_program = &ctx.accounts.associated_token_program.to_account_info();
    let token_metadata_program = &ctx.accounts.token_metadata_program.to_account_info();
    let token_account = &ctx.accounts.token_account.to_account_info();
    let authority_pda_token_account = &ctx.accounts.authority_pda_token_account.to_account_info();
    let authority_pda = &ctx.accounts.authority_pda.to_account_info();
    let authority = &ctx.accounts.authority.to_account_info();
    let edition = &ctx.accounts.edition.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();
    let seller = &ctx.accounts.seller.to_account_info();
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let seller_history = &mut ctx.accounts.seller_history;

    processors::remove_multiple_items_span(
        gumball_machine,
        authority.key(),
        mint.key(),
        seller.key(),
        1,
        index,
        index,
    )?;

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        ctx.accounts.gumball_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    let metadata_account = &ctx
        .accounts
        .metadata
        .as_ref()
        .map(|acc| acc.to_account_info());
    let metadata_account_ref = metadata_account.as_ref();

    thaw_and_revoke_nft_v2(
        authority,
        seller,
        mint,
        token_account,
        edition,
        authority_pda,
        &auth_seeds,
        token_metadata_program,
        token_program,
        metadata_account_ref,
        ctx.accounts.seller_token_record.as_ref(),
        ctx.accounts.auth_rules.as_ref(),
        system_program,
        ctx.accounts.instructions.as_ref(),
        ctx.accounts.auth_rules_program.as_ref(),
        associated_token_program,
        authority_pda_token_account,
        rent,
    )?;

    seller_history.item_count -= 1;

    if seller_history.item_count == 0 {
        seller_history.close(seller.to_account_info())?;
    }

    Ok(())
}
