use crate::{processors::claim_item, thaw_nft, GumballError, GumballMachine};
use anchor_lang::prelude::*;
use mpl_token_metadata::accounts::Metadata;
use solana_program::program::invoke_signed;
use utils::transfer_nft;

pub fn claim_nft_v2<'a, 'b>(
    gumball_machine: &mut Box<Account<'a, GumballMachine>>,
    index: u32,
    authority_pda: &AccountInfo<'a>,
    payer: &AccountInfo<'a>,
    to: &AccountInfo<'a>,
    to_token_account: &AccountInfo<'a>,
    from: &AccountInfo<'a>,
    from_token_account: &AccountInfo<'a>,
    authority_pda_token_account: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    edition: &AccountInfo<'a>,
    metadata: &Metadata,
    metadata_info: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    associated_token_program: &AccountInfo<'a>,
    token_metadata_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    rent: &AccountInfo<'a>,
    auth_seeds: &[&[u8]],
    seller_token_record: Option<&UncheckedAccount<'a>>,
    authority_pda_token_record: Option<&UncheckedAccount<'a>>,
    to_token_record: Option<&UncheckedAccount<'a>>,
    rules: Option<&UncheckedAccount<'a>>,
    sysvar_instructions: Option<&UncheckedAccount<'a>>,
    auth_rules_program: Option<&UncheckedAccount<'a>>,
) -> Result<()> {
    claim_item(gumball_machine, index)?;

    transfer_nft_with_revoke(
        authority_pda,
        payer,
        to,
        to_token_account,
        from,
        from_token_account,
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
        auth_seeds,
        seller_token_record,
        authority_pda_token_record,
        to_token_record,
        rules,
        sysvar_instructions,
        auth_rules_program,
        None,
    )?;

    Ok(())
}

pub fn transfer_nft_with_revoke<'a, 'b>(
    authority_pda: &AccountInfo<'a>,
    payer: &AccountInfo<'a>,
    to: &AccountInfo<'a>,
    to_token_account: &AccountInfo<'a>,
    from: &AccountInfo<'a>,
    from_token_account: &AccountInfo<'a>,
    authority_pda_token_account: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    edition: &AccountInfo<'a>,
    metadata: &Metadata,
    metadata_info: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    associated_token_program: &AccountInfo<'a>,
    token_metadata_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    rent: &AccountInfo<'a>,
    auth_seeds: &[&[u8]],
    seller_token_record: Option<&UncheckedAccount<'a>>,
    authority_pda_token_record: Option<&UncheckedAccount<'a>>,
    to_token_record: Option<&UncheckedAccount<'a>>,
    rules: Option<&UncheckedAccount<'a>>,
    sysvar_instructions: Option<&UncheckedAccount<'a>>,
    auth_rules_program: Option<&UncheckedAccount<'a>>,
    rent_recipient: Option<&AccountInfo<'a>>,
) -> Result<()> {
    thaw_nft(
        payer,
        from,
        mint,
        from_token_account,
        edition,
        authority_pda,
        &auth_seeds,
        token_metadata_program,
        token_program,
        Some(metadata_info),
        Some(metadata),
        seller_token_record,
        rules,
        system_program,
        sysvar_instructions,
        auth_rules_program,
    )?;

    if from.key() != authority_pda.key() {
        require!(
            authority_pda.key() != Pubkey::default(),
            GumballError::IncorrectOwner
        );

        // Transfer to authority pda first so transfer auth can be revoked
        transfer_nft(
            from,
            authority_pda,
            from_token_account,
            authority_pda_token_account,
            mint,
            edition,
            metadata,
            metadata_info,
            payer,
            associated_token_program,
            token_program,
            token_metadata_program,
            system_program,
            rent,
            authority_pda,
            Some(&auth_seeds),
            None,
            seller_token_record,
            authority_pda_token_record,
            rules,
            auth_rules_program,
            sysvar_instructions,
        )?;

        require!(to.key() != Pubkey::default(), GumballError::IncorrectOwner);
    }

    transfer_nft(
        authority_pda,
        to,
        authority_pda_token_account,
        to_token_account,
        mint,
        edition,
        metadata,
        metadata_info,
        payer,
        associated_token_program,
        token_program,
        token_metadata_program,
        system_program,
        rent,
        authority_pda,
        Some(&auth_seeds),
        None,
        authority_pda_token_record,
        to_token_record,
        rules,
        auth_rules_program,
        sysvar_instructions,
    )?;

    let rent_recipient = if let Some(rent_recipient) = rent_recipient {
        rent_recipient
    } else {
        payer
    };

    // Close the tmp account back to payer
    invoke_signed(
        &spl_token::instruction::close_account(
            token_program.key,
            authority_pda_token_account.key,
            rent_recipient.key,
            authority_pda.key,
            &[],
        )?,
        &[
            token_program.to_account_info(),
            authority_pda_token_account.to_account_info(),
            rent_recipient.to_account_info(),
            authority_pda.to_account_info(),
            system_program.to_account_info(),
        ],
        &[&auth_seeds],
    )?;

    Ok(())
}
