use super::*;

use mallow_gumball::constants::AUTHORITY_SEED;
use solana_program::{program::invoke, system_instruction};

use crate::{
    errors::GumballGuardError,
    state::GuardType,
    utils::{assert_derivation, assert_keys_equal, get_bps_of},
};

/// Guard that charges an amount in SOL (lamports) for the mint.
///
/// List of accounts required:
///
///   0. `[]` Account to receive the funds.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SolPayment {
    pub lamports: u64,
}

impl Guard for SolPayment {
    fn size() -> usize {
        8 // lamports
    }

    fn mask() -> u64 {
        GuardType::as_mask(GuardType::SolPayment)
    }
}

impl Condition for SolPayment {
    fn validate<'info>(
        &self,
        ctx: &mut EvaluationContext,
        _guard_set: &GuardSet,
        _mint_args: &[u8],
    ) -> Result<()> {
        let index = ctx.account_cursor;
        // validates that we received all required accounts
        let destination = try_get_account_info(ctx.accounts.remaining, index)?;

        require!(
            ctx.accounts.gumball_machine.settings.payment_mint == spl_token::native_mint::id(),
            GumballGuardError::InvalidPaymentMint
        );

        let seeds = [
            AUTHORITY_SEED.as_bytes(),
            ctx.accounts.gumball_machine.to_account_info().key.as_ref(),
        ];
        assert_derivation(&mallow_gumball::ID, destination, &seeds)?;

        ctx.account_cursor += 1;

        if let Some(fee_config) = ctx.accounts.gumball_machine.marketplace_fee_config {
            if ctx.accounts.gumball_machine.version > 0 {
                ctx.account_cursor += 1;

                let fee_destination = try_get_account_info(ctx.accounts.remaining, index + 1)?;
                assert_keys_equal(&fee_destination.key(), &fee_config.fee_account)?;
            }
        }

        ctx.indices.insert("lamports_destination", index);

        if ctx.accounts.payer.lamports() < self.lamports {
            msg!(
                "Require {} lamports, accounts has {} lamports",
                self.lamports,
                ctx.accounts.payer.lamports(),
            );
            return err!(GumballGuardError::NotEnoughSOL);
        }

        Ok(())
    }

    fn pre_actions<'info>(
        &self,
        ctx: &mut EvaluationContext,
        _guard_set: &GuardSet,
        _mint_args: &[u8],
    ) -> Result<()> {
        let lamports_destination_index = ctx.indices["lamports_destination"];
        let destination = try_get_account_info(ctx.accounts.remaining, lamports_destination_index)?;

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

        let marketplace_fee = get_bps_of(self.lamports, marketplace_fee_bps)?;
        msg!("Marketplace fee: {}", marketplace_fee);

        if marketplace_fee > 0 {
            let fee_destination =
                try_get_account_info(ctx.accounts.remaining, lamports_destination_index + 1)?;

            invoke(
                &system_instruction::transfer(
                    &ctx.accounts.payer.key(),
                    &fee_destination.key(),
                    marketplace_fee,
                ),
                &[
                    ctx.accounts.payer.to_account_info(),
                    fee_destination.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
        }

        let price_less_fees = self
            .lamports
            .checked_sub(marketplace_fee)
            .ok_or(GumballGuardError::NumericalOverflowError)?;

        invoke(
            &system_instruction::transfer(
                &ctx.accounts.payer.key(),
                &destination.key(),
                price_less_fees,
            ),
            &[
                ctx.accounts.payer.to_account_info(),
                destination.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        cpi_increment_total_revenue(ctx, self.lamports)?;

        Ok(())
    }
}
