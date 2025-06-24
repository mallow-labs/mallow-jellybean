use crate::{
    assert_keys_equal, constants::AUTHORITY_SEED, events::ClaimItemEvent, processors::claim_item,
    state::JellybeanMachine, JellybeanError, JellybeanState, UnclaimedPrizes,
    BASE_JELLYBEAN_MACHINE_SIZE, LOADED_ITEM_SIZE,
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
    print_asset: Option<UncheckedAccount<'info>>,

    /// CHECK: Safe due to constraint
    #[account(address = mpl_core::ID)]
    mpl_core_program: UncheckedAccount<'info>,

    system_program: Program<'info, System>,
}

pub fn claim_core_item<'info>(
    ctx: Context<'_, '_, '_, 'info, ClaimCoreItem<'info>>,
    index: u16,
) -> Result<()> {
    let unclaimed_prizes = &mut ctx.accounts.unclaimed_prizes;
    let jellybean_machine_info = &ctx.accounts.jellybean_machine.to_account_info();
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

    let prize = claim_item(unclaimed_prizes, index)?;

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        jellybean_machine_info.key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

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

    let data = jellybean_machine_info.data.borrow();
    let item_position = BASE_JELLYBEAN_MACHINE_SIZE + (index as usize) * LOADED_ITEM_SIZE;
    let prize_mint = Pubkey::try_from_slice(&data[item_position..item_position + 32])?;
    assert_keys_equal(mint, prize_mint, "Invalid mint")?;

    let jellybean_machine = &mut ctx.accounts.jellybean_machine;
    jellybean_machine.supply_settled = jellybean_machine
        .supply_settled
        .checked_add(1)
        .ok_or(JellybeanError::NumericalOverflowError)?;

    emit_cpi!(ClaimItemEvent {
        mint,
        authority: jellybean_machine.authority.key(),
    });

    Ok(())
}
