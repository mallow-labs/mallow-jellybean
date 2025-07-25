use crate::{
    assert_keys_equal, constants::AUTHORITY_SEED, events::ClaimItemEvent, state::JellybeanMachine,
    JellybeanError, JellybeanState, UnclaimedPrizes,
};
use anchor_lang::prelude::*;
use mpl_core::{
    instructions::{CreateV1CpiBuilder, TransferV1CpiBuilder},
    types::{Edition, Plugin, PluginAuthorityPair},
    Collection,
};

#[event_cpi]
#[derive(Accounts)]
pub struct ClaimCoreItem<'info> {
    /// Anyone can settle the sale
    #[account(mut)]
    payer: Signer<'info>,

    /// Jellybean machine account.
    #[account(
        mut,
        constraint = jellybean_machine.state == JellybeanState::SaleLive || jellybean_machine.state == JellybeanState::SaleEnded @ JellybeanError::InvalidState
    )]
    jellybean_machine: Box<Account<'info, JellybeanMachine>>,

    /// CHECK: Safe due to seeds constraint
    #[account(
        mut,
        seeds = [
            AUTHORITY_SEED.as_bytes(),
            jellybean_machine.key().as_ref()
        ],
        bump
    )]
    authority_pda: UncheckedAccount<'info>,

    /// buyer of the nft
    /// CHECK: Safe due to item check
    #[account(mut)]
    buyer: UncheckedAccount<'info>,

    /// Buyer unclaimed draws account.
    #[account(
        mut,
        seeds = [
            UnclaimedPrizes::SEED_PREFIX.as_bytes(),
            jellybean_machine.key().as_ref(),
            buyer.key().as_ref(),
        ],
        bump,
        has_one = buyer @ JellybeanError::InvalidBuyer,
        has_one = jellybean_machine @ JellybeanError::InvalidJellybeanMachine
    )]
    unclaimed_prizes: Box<Account<'info, UnclaimedPrizes>>,

    /// CHECK: Safe due to item check
    #[account(mut)]
    asset: Option<UncheckedAccount<'info>>,

    /// CHECK: Safe due to item check
    #[account(mut)]
    collection: Option<UncheckedAccount<'info>>,

    /// CHECK: Safe due to item check
    #[account(mut)]
    print_asset: Option<Signer<'info>>,

    /// CHECK: Safe due to constraint
    #[account(address = mpl_core::ID)]
    mpl_core_program: UncheckedAccount<'info>,

    system_program: Program<'info, System>,
}

pub fn claim_core_item<'info>(
    ctx: Context<'_, '_, '_, 'info, ClaimCoreItem<'info>>,
    index: u8,
) -> Result<()> {
    let unclaimed_prizes = &mut ctx.accounts.unclaimed_prizes;
    let jellybean_machine = &ctx.accounts.jellybean_machine;
    let jellybean_machine_info = &jellybean_machine.to_account_info();
    let payer = &ctx.accounts.payer.to_account_info();
    let buyer = &ctx.accounts.buyer.to_account_info();
    let authority_pda = &mut ctx.accounts.authority_pda.to_account_info();
    let mpl_core_program = &ctx.accounts.mpl_core_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();

    let collection_info = ctx
        .accounts
        .collection
        .as_ref()
        .map(|account| account.to_account_info());
    let collection = collection_info.as_ref();

    let prize = unclaimed_prizes.claim_item(index)?;

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        jellybean_machine_info.key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    let mut data = jellybean_machine_info.data.borrow_mut();
    let loaded_item = jellybean_machine.get_loaded_item_at_index(&data, index as usize)?;

    let mint = if let Some(asset) = &ctx.accounts.asset {
        // Transfer the core asset to the buyer
        TransferV1CpiBuilder::new(mpl_core_program)
            .asset(asset)
            .collection(collection)
            .payer(payer)
            .authority(Some(authority_pda))
            .new_owner(buyer)
            .system_program(Some(system_program))
            .invoke_signed(&[&auth_seeds])?;

        asset.key()
    } else if let Some(collection_account) = &ctx.accounts.collection {
        let collection_info = collection_account.to_account_info();
        let collection = Box::<Collection>::try_from(&collection_info)?;
        let plugin = collection.plugin_list.master_edition.unwrap();

        let edition_number = prize.edition_number;
        let print_asset = ctx
            .accounts
            .print_asset
            .as_ref()
            .ok_or(JellybeanError::MissingPrintAsset)?;

        msg!("printing edition number: {}", edition_number);

        // Send any escrow amount to the payer first
        if loaded_item.escrow_amount > 0 {
            let mut authority_lamports = authority_pda.try_borrow_mut_lamports()?;
            **authority_lamports -= loaded_item.escrow_amount;
            let mut payer_lamports = payer.try_borrow_mut_lamports()?;
            **payer_lamports += loaded_item.escrow_amount;
        }

        CreateV1CpiBuilder::new(mpl_core_program)
            .asset(print_asset)
            .collection(Some(collection_account))
            .payer(payer)
            .name(if let Some(name) = plugin.master_edition.name {
                name
            } else {
                collection.base.name
            })
            .uri(if let Some(uri) = plugin.master_edition.uri {
                uri
            } else {
                collection.base.uri
            })
            .owner(Some(buyer))
            .plugins(vec![PluginAuthorityPair {
                authority: None,
                plugin: Plugin::Edition(Edition {
                    number: edition_number,
                }),
            }])
            .system_program(system_program)
            .authority(Some(authority_pda))
            .invoke_signed(&[&auth_seeds])?;

        collection_account.key()
    } else {
        return err!(JellybeanError::InvalidAsset);
    };

    assert_keys_equal(mint, loaded_item.mint, "Invalid mint")?;

    let item_position = jellybean_machine.get_loaded_item_position(index as usize);
    let supply_claimed_slice: &mut [u8] = &mut data[item_position + 40..item_position + 44];
    supply_claimed_slice.copy_from_slice(&u32::to_le_bytes(loaded_item.supply_claimed + 1));

    drop(data);

    // Close unclaimed_prize account back to the buyer if it's empty
    if unclaimed_prizes.prizes.is_empty() {
        unclaimed_prizes.close(buyer.to_account_info())?;
    } else {
        // Calculate new space needed and reallocate if smaller
        let new_space = UnclaimedPrizes::space(unclaimed_prizes.prizes.len());
        let rent = Rent::get()?;
        let new_rent_minimum = rent.minimum_balance(new_space);
        let current_lamports = unclaimed_prizes.to_account_info().lamports();

        // Reallocate the account
        unclaimed_prizes
            .to_account_info()
            .realloc(new_space, false)?;

        // Refund excess rent to buyer
        let excess_lamports = current_lamports - new_rent_minimum;
        // Transfer excess lamports to buyer
        **unclaimed_prizes
            .to_account_info()
            .try_borrow_mut_lamports()? -= excess_lamports;
        **buyer.try_borrow_mut_lamports()? += excess_lamports;
    }

    emit_cpi!(ClaimItemEvent {
        authority: ctx.accounts.jellybean_machine.authority.key(),
        edition_number: prize.edition_number,
    });

    Ok(())
}
