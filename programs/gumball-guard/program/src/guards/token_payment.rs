use mallow_gumball::constants::AUTHORITY_SEED;

use super::*;

use crate::{
    errors::GumballGuardError,
    state::GuardType,
    utils::{assert_is_token_account, get_bps_of, spl_token_transfer, TokenTransferParams},
};

/// Guard that charges an amount in a specified spl-token as payment for the mint.
///
/// List of accounts required:
///
///   0. `[writable]` Token account holding the required amount.
///   1. `[writable]` Address of the ATA to receive the tokens.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TokenPayment {
    pub amount: u64,
    pub mint: Pubkey,
}

impl Guard for TokenPayment {
    fn size() -> usize {
        8    // amount
        + 32 // token mint
    }

    fn mask() -> u64 {
        GuardType::as_mask(GuardType::TokenPayment)
    }
}

impl Condition for TokenPayment {
    fn validate<'info>(
        &self,
        ctx: &mut EvaluationContext,
        _guard_set: &GuardSet,
        _mint_args: &[u8],
    ) -> Result<()> {
        require!(
            ctx.accounts.gumball_machine.settings.payment_mint == self.mint,
            GumballGuardError::InvalidPaymentMint
        );

        // token
        let token_account_index = ctx.account_cursor;
        let token_account_info = try_get_account_info(ctx.accounts.remaining, token_account_index)?;
        let destination_ata =
            try_get_account_info(ctx.accounts.remaining, token_account_index + 1)?;
        ctx.account_cursor += 2;

        if let Some(fee_config) = ctx.accounts.gumball_machine.marketplace_fee_config {
            if ctx.accounts.gumball_machine.version > 0 {
                ctx.account_cursor += 1;

                let fee_ata =
                    try_get_account_info(ctx.accounts.remaining, token_account_index + 2)?;
                assert_is_token_account(fee_ata, &fee_config.fee_account, &self.mint)?;
            }
        }

        let seeds = [
            AUTHORITY_SEED.as_bytes(),
            ctx.accounts.gumball_machine.to_account_info().key.as_ref(),
        ];
        let (authority_pda, _) = Pubkey::find_program_address(&seeds, &mallow_gumball::ID);
        assert_is_token_account(destination_ata, &authority_pda, &self.mint)?;

        let token_account =
            assert_is_token_account(token_account_info, ctx.accounts.buyer.key, &self.mint)?;

        if token_account.amount < self.amount {
            return err!(GumballGuardError::NotEnoughTokens);
        }

        ctx.indices
            .insert("token_payment_index", token_account_index);

        Ok(())
    }

    fn pre_actions<'info>(
        &self,
        ctx: &mut EvaluationContext,
        _guard_set: &GuardSet,
        _mint_args: &[u8],
    ) -> Result<()> {
        let index = ctx.indices["token_payment_index"];
        // the accounts have already been validated
        let token_account_info = try_get_account_info(ctx.accounts.remaining, index)?;
        let destination_ata = try_get_account_info(ctx.accounts.remaining, index + 1)?;

        let marketplace_fee_bps =
            if let Some(fee_confg) = ctx.accounts.gumball_machine.marketplace_fee_config {
                // Version 0 takes fee on claim, so no fee on draw
                if ctx.accounts.gumball_machine.version == 0 {
                    0
                } else {
                    fee_confg.fee_bps
                }
            } else {
                0
            };

        let marketplace_fee = get_bps_of(self.amount, marketplace_fee_bps)?;
        msg!("Marketplace fee: {}", marketplace_fee);

        if marketplace_fee > 0 {
            let fee_destination_ata = try_get_account_info(ctx.accounts.remaining, index + 2)?;

            spl_token_transfer(TokenTransferParams {
                source: token_account_info.to_account_info(),
                destination: fee_destination_ata.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
                authority_signer_seeds: &[],
                token_program: ctx.accounts.spl_token_program.to_account_info(),
                amount: marketplace_fee,
            })?;
        }

        let price_less_fees = self
            .amount
            .checked_sub(marketplace_fee)
            .ok_or(GumballGuardError::NumericalOverflowError)?;

        spl_token_transfer(TokenTransferParams {
            source: token_account_info.to_account_info(),
            destination: destination_ata.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
            authority_signer_seeds: &[],
            token_program: ctx.accounts.spl_token_program.to_account_info(),
            amount: price_less_fees,
        })?;

        cpi_increment_total_revenue(ctx, self.amount)?;

        Ok(())
    }
}
