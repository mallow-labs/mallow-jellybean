use crate::{
    assert_config_line, constants::AUTHORITY_SEED, events::ClaimItemEvent, processors,
    state::GumballMachine, AssociatedToken, ConfigLine, GumballError, GumballState, Token,
    TokenStandard,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

/// Settles a legacy NFT sale
#[event_cpi]
#[derive(Accounts)]
pub struct ClaimTokens<'info> {
    /// Anyone can settle the sale
    #[account(mut)]
    payer: Signer<'info>,

    /// Gumball machine account.
    #[account(
        mut,
        has_one = authority,
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

    /// Gumball machine authority
    /// CHECK: Safe due to gumball machine authority check
    #[account(mut)]
    authority: UncheckedAccount<'info>,

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

    mint: Box<Account<'info, Mint>>,

    /// CHECK: Safe due to transfer checks
    #[account(mut)]
    buyer_token_account: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = authority_pda_token_account.mint == mint.key(),
        constraint = authority_pda_token_account.owner == authority_pda.key(),
    )]
    authority_pda_token_account: Box<Account<'info, TokenAccount>>,
}

pub fn claim_tokens<'info>(
    ctx: Context<'_, '_, '_, 'info, ClaimTokens<'info>>,
    index: u32,
) -> Result<()> {
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let payer = &ctx.accounts.payer.to_account_info();
    let buyer = &ctx.accounts.buyer.to_account_info();
    let buyer_token_account = &ctx.accounts.buyer_token_account.to_account_info();
    let authority_pda_token_account = &mut ctx.accounts.authority_pda_token_account;
    let authority_pda = &mut ctx.accounts.authority_pda.to_account_info();
    let seller = &mut ctx.accounts.seller.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let associated_token_program = &ctx.accounts.associated_token_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let rent = &ctx.accounts.rent.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();
    let authority = &ctx.accounts.authority.to_account_info();

    assert_config_line(
        gumball_machine,
        index,
        ConfigLine {
            mint: mint.key(),
            seller: seller.key(),
            buyer: buyer.key(),
            token_standard: TokenStandard::Fungible,
        },
        false
    )?;

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        gumball_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    let amount = processors::claim_tokens(
        gumball_machine,
        index,
        authority,
        authority_pda,
        payer,
        buyer,
        buyer_token_account,
        authority_pda_token_account,
        mint,
        token_program,
        associated_token_program,
        system_program,
        rent,
        &auth_seeds,
    )?;

    emit_cpi!(ClaimItemEvent {
        mint: mint.key(),
        authority: gumball_machine.authority.key(),
        seller: seller.key(),
        buyer: buyer.key(),
        amount,
    });

    Ok(())
}
