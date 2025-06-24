use anchor_lang::prelude::*;

use crate::JellybeanMachine;

/// Sets a new jellybean machine authority.
#[derive(Accounts)]
pub struct SetMintAuthority<'info> {
    /// Gumball Machine account.
    #[account(mut, has_one = authority)]
    jellybean_machine: Account<'info, JellybeanMachine>,

    /// Gumball Machine authority
    authority: Signer<'info>,

    /// New jellybean machine authority
    mint_authority: Signer<'info>,
}

pub fn set_mint_authority(ctx: Context<SetMintAuthority>) -> Result<()> {
    let jellybean_machine = &mut ctx.accounts.jellybean_machine;

    jellybean_machine.mint_authority = ctx.accounts.mint_authority.key();

    Ok(())
}
