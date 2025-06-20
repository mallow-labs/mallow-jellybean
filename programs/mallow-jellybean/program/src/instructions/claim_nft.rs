use crate::{
    assert_config_line,
    constants::{AUTHORITY_SEED, MPL_TOKEN_AUTH_RULES_PROGRAM},
    events::ClaimItemEvent,
    processors,
    state::GumballMachine,
    token_standard_from_mpl_token_standard, AssociatedToken, ConfigLine, GumballError,
    GumballState, Token,
};
use anchor_lang::prelude::*;
use mpl_token_metadata::accounts::Metadata;

/// Settles a legacy NFT sale
#[event_cpi]
#[derive(Accounts)]
pub struct ClaimNft<'info> {
    /// Anyone can settle the sale
    #[account(mut)]
    payer: Signer<'info>,

    /// Gumball machine account.
    #[account(
        mut,
        constraint = gumball_machine.state == GumballState::SaleLive || gumball_machine.state == GumballState::SaleEnded @ GumballError::InvalidState
    )]
    gumball_machine: Box<Account<'info, GumballMachine>>,

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
    /// CHECK: Safe due to item check
    #[account(mut)]
    seller: UncheckedAccount<'info>,

    /// buyer of the nft
    /// CHECK: Safe due to item check
    buyer: UncheckedAccount<'info>,

    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,

    /// CHECK: Safe due to item check
    mint: UncheckedAccount<'info>,

    /// CHECK: Safe due to thaw/transfer
    #[account(mut)]
    token_account: UncheckedAccount<'info>,

    /// Nft token account for buyer
    /// CHECK: Safe due to ata check in transfer
    #[account(mut)]
    buyer_token_account: UncheckedAccount<'info>,

    /// CHECK: Safe due to transfer
    #[account(mut)]
    authority_pda_token_account: UncheckedAccount<'info>,

    /// CHECK: Safe due to processor royalties check
    #[account(mut)]
    metadata: UncheckedAccount<'info>,

    /// CHECK: Safe due to thaw/send
    #[account(mut)]
    edition: UncheckedAccount<'info>,

    /// CHECK: Safe due to constraint
    #[account(address = mpl_token_metadata::ID)]
    token_metadata_program: UncheckedAccount<'info>,

    /// OPTIONAL PNFT ACCOUNTS
    /// CHECK: Safe due to token metadata program check
    #[account(mut)]
    pub seller_token_record: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to token metadata program check
    #[account(mut)]
    pub authority_pda_token_record: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to token metadata program check
    #[account(mut)]
    pub buyer_token_record: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to token metadata program check
    pub auth_rules: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to address check
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: Option<UncheckedAccount<'info>>,
    /// CHECK: Safe due to address check
    #[account(address = MPL_TOKEN_AUTH_RULES_PROGRAM)]
    pub auth_rules_program: Option<UncheckedAccount<'info>>,
}

pub fn claim_nft<'info>(
    ctx: Context<'_, '_, '_, 'info, ClaimNft<'info>>,
    index: u32,
) -> Result<()> {
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let payer = &ctx.accounts.payer.to_account_info();
    let buyer = &ctx.accounts.buyer.to_account_info();
    let buyer_token_account = &ctx.accounts.buyer_token_account.to_account_info();
    let authority_pda_token_account = &ctx.accounts.authority_pda_token_account.to_account_info();
    let authority_pda = &mut ctx.accounts.authority_pda.to_account_info();
    let seller = &mut ctx.accounts.seller.to_account_info();
    let token_metadata_program = &ctx.accounts.token_metadata_program.to_account_info();
    let token_account = &ctx.accounts.token_account.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let associated_token_program = &ctx.accounts.associated_token_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let rent = &ctx.accounts.rent.to_account_info();
    let edition = &ctx.accounts.edition.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();
    let metadata_info = &ctx.accounts.metadata.to_account_info();
    let metadata = &Metadata::try_from(metadata_info)?;

    assert_config_line(
        gumball_machine,
        index,
        ConfigLine {
            mint: mint.key(),
            seller: seller.key(),
            buyer: buyer.key(),
            token_standard: token_standard_from_mpl_token_standard(&metadata)?,
        },
        false
    )?;

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        gumball_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    processors::claim_nft_v2(
        gumball_machine,
        index,
        authority_pda,
        payer,
        buyer,
        buyer_token_account,
        seller,
        token_account,
        authority_pda_token_account,
        mint,
        edition,
        metadata,
        metadata_info,
        token_program,
        associated_token_program,
        token_metadata_program,
        system_program,
        rent,
        &auth_seeds,
        ctx.accounts.seller_token_record.as_ref(),
        ctx.accounts.authority_pda_token_record.as_ref(),
        ctx.accounts.buyer_token_record.as_ref(),
        ctx.accounts.auth_rules.as_ref(),
        ctx.accounts.instructions.as_ref(),
        ctx.accounts.auth_rules_program.as_ref(),
    )?;

    emit_cpi!(ClaimItemEvent {
        mint: mint.key(),
        authority: gumball_machine.authority.key(),
        seller: seller.key(),
        buyer: buyer.key(),
        amount: 1,
    });

    Ok(())
}
