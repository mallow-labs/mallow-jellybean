use crate::{
    constants::AUTHORITY_SEED, events::DrawItemEvent, JellybeanError, JellybeanMachine,
    JellybeanState, LoadedItem, Prize, UnclaimedPrizes, BASE_JELLYBEAN_MACHINE_SIZE,
    LOADED_ITEM_SIZE,
};
use anchor_lang::prelude::*;
use arrayref::array_ref;
use solana_program::sysvar;
use std::cell::RefMut;

/// Draws an item from the jellybean machine.
#[event_cpi]
#[derive(Accounts)]
pub struct Draw<'info> {
    /// Jellybean machine account.
    #[account(
        mut, 
        has_one = mint_authority,
        constraint = jellybean_machine.state == JellybeanState::SaleLive @ JellybeanError::InvalidState
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

    /// Jellybean machine mint authority (mint only allowed for the mint_authority).
    mint_authority: Signer<'info>,

    /// Payer for the transaction and account allocation (rent).
    #[account(mut)]
    payer: Signer<'info>,

    /// NFT account owner.
    ///
    /// CHECK: account not written or read from
    buyer: UncheckedAccount<'info>,

    /// Buyer unclaimed draws account.
    #[account(
        init_if_needed,
        seeds = [
            UnclaimedPrizes::SEED_PREFIX.as_bytes(),
            jellybean_machine.key().as_ref(),
            buyer.key().as_ref(),
        ],
        bump,
        space = if unclaimed_prizes.data_is_empty() {UnclaimedPrizes::space(0)} else {unclaimed_prizes.data_len()},
        payer = payer,
    )]
    unclaimed_prizes: Box<Account<'info, UnclaimedPrizes>>,

    /// System program.
    system_program: Program<'info, System>,

    /// Rent.
    /// CHECK: account constraints checked in account trait
    #[account(address = sysvar::rent::id())]
    rent: UncheckedAccount<'info>,

    /// SlotHashes sysvar cluster data.
    ///
    /// CHECK: account constraints checked in account trait
    #[account(address = sysvar::slot_hashes::id())]
    recent_slothashes: UncheckedAccount<'info>,
}

/// Accounts to mint an NFT.
pub(crate) struct DrawAccounts<'info> {
    pub recent_slothashes: AccountInfo<'info>,
}

pub fn draw<'info>(ctx: Context<'_, '_, '_, 'info, Draw<'info>>) -> Result<()> {
    let jellybean_machine = &mut ctx.accounts.jellybean_machine;
    let unclaimed_prizes = &mut ctx.accounts.unclaimed_prizes;

    if unclaimed_prizes.jellybean_machine == Pubkey::default() {
        unclaimed_prizes.version = UnclaimedPrizes::CURRENT_VERSION;
        unclaimed_prizes.jellybean_machine = jellybean_machine.key();
        unclaimed_prizes.buyer = ctx.accounts.buyer.key();
    }

    // Calculate space needed for one more prize
    let current_len = unclaimed_prizes.prizes.len();
    let new_space = UnclaimedPrizes::space(current_len + 1);

    let rent = Rent::get()?;
    let new_rent_minimum = rent.minimum_balance(new_space);
    let current_lamports = unclaimed_prizes.to_account_info().lamports();

    let additional_lamports = new_rent_minimum - current_lamports;
    // Transfer additional lamports from payer
    anchor_lang::system_program::transfer(
        anchor_lang::context::CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: unclaimed_prizes.to_account_info(),
            },
        ),
        additional_lamports,
    )?;

    // Reallocate the account
    unclaimed_prizes
        .to_account_info()
        .realloc(new_space, false)?;

    let accounts = DrawAccounts {
        recent_slothashes: ctx.accounts.recent_slothashes.to_account_info(),
    };

    let prize = process_draw(jellybean_machine, accounts)?;

    msg!(
        "Drew item at index: {} edition: {}",
        prize.item_index,
        prize.edition_number
    );
    // Append prize to unclaimed_prizes - this should now have enough space
    unclaimed_prizes.prizes.push(prize);

    emit_cpi!(DrawItemEvent {
        authority: ctx.accounts.jellybean_machine.authority.key(),
        index: prize.item_index as u32,
    });

    Ok(())
}

/// Mint a new NFT.
///
/// The index minted depends on the configuration of the jellybean machine: it could be
/// a psuedo-randomly selected one or sequential. In both cases, after minted a
/// specific index, the jellybean machine does not allow to mint the same index again.
pub(crate) fn process_draw(
    jellybean_machine: &mut Box<Account<'_, JellybeanMachine>>,
    accounts: DrawAccounts,
) -> Result<Prize> {
    let account_info = jellybean_machine.to_account_info();
    let account_data = account_info.data.borrow_mut();
    let supply_loaded = jellybean_machine.supply_loaded;

    // are there items to be minted?
    if jellybean_machine.supply_redeemed >= supply_loaded {
        return err!(JellybeanError::JellybeanMachineEmpty);
    }

    // (2) selecting an item to mint
    let recent_slothashes = &accounts.recent_slothashes;
    let data = recent_slothashes.data.borrow();
    let most_recent = array_ref![data, 12, 8];

    let clock = Clock::get()?;
    // seed for the random number is a combination of the slot_hash - timestamp
    let seed = u64::from_le_bytes(*most_recent).saturating_sub(clock.unix_timestamp as u64);

    let target_supply_index: usize =
        seed.checked_rem(supply_loaded - jellybean_machine.supply_redeemed)
            .ok_or(JellybeanError::NumericalOverflowError)? as usize;

    let prize = get_prize_and_update_supply_redeemed(
        account_data,
        jellybean_machine.items_loaded,
        target_supply_index,
    )?;

    jellybean_machine.supply_redeemed = jellybean_machine
        .supply_redeemed
        .checked_add(1)
        .ok_or(JellybeanError::NumericalOverflowError)?;

    // Sale has ended if this is the last item to be redeemed
    if jellybean_machine.supply_redeemed == supply_loaded {
        jellybean_machine.state = JellybeanState::SaleEnded;
    }

    // release the data borrow
    drop(data);

    Ok(prize)
}

/// Get the prize for a given target supply index.
/// The target supply index is the index of the item in the remaining supply across all items.
fn get_prize_and_update_supply_redeemed(
    mut account_data: RefMut<'_, &mut [u8]>,
    items_loaded: u16,
    target_supply_index: usize,
) -> Result<Prize> {
    // Iterate the loaded items section of the account data
    let mut remaining_supply_covered = 0;

    for i in 0..items_loaded {
        let item_position = BASE_JELLYBEAN_MACHINE_SIZE + i as usize * LOADED_ITEM_SIZE;
        let item_data = &account_data[item_position..item_position + LOADED_ITEM_SIZE];
        let item = LoadedItem::try_from_slice(item_data)?;
        let remaining_supply = item.supply_loaded - item.supply_redeemed;

        // Skip items with no remaining supply
        if remaining_supply == 0 {
            continue;
        }

        // Check if the target index falls within this item's remaining supply
        if target_supply_index < remaining_supply_covered + remaining_supply as usize {
            // Update the supply_redeemed count for the item
            let new_supply_redeemed = item
                .supply_redeemed
                .checked_add(1)
                .ok_or(JellybeanError::NumericalOverflowError)?;

            // 36 is the offset of the supply_redeemed field in the LoadedItem struct
            let supply_redeemed_slice: &mut [u8] =
                &mut account_data[item_position + 36..item_position + 40];
            supply_redeemed_slice.copy_from_slice(&u32::to_le_bytes(new_supply_redeemed));

            return Ok(Prize {
                item_index: i,
                edition_number: new_supply_redeemed,
            });
        }

        remaining_supply_covered += remaining_supply as usize;
    }

    err!(JellybeanError::IndexGreaterThanLength)
}
