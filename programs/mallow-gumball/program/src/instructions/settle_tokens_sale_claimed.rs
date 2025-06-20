use crate::{
    constants::{AUTHORITY_SEED, GUMBALL_MACHINE_SIZE, SELLER_HISTORY_SEED},
    events::SettleItemSaleEvent,
    get_config_count,
    processors::{get_total_proceeds, transfer_proceeds},
    state::GumballMachine,
    transfer_and_close_if_empty, try_from, AssociatedToken, GumballError, SellerHistory, Token,
    TokenStandard,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use arrayref::array_ref;
use utils::RoyaltyInfo;

/// Settles a span of token sales that have already been claimed
#[event_cpi]
#[derive(Accounts)]
pub struct SettleTokensSaleClaimed<'info> {
    /// Anyone can settle the sale
    #[account(mut)]
    payer: Signer<'info>,

    /// Gumball machine account.
    #[account(
        mut,
        has_one = authority @ GumballError::InvalidAuthority,
        constraint = gumball_machine.can_settle_items() @ GumballError::InvalidState
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

    /// Payment account for authority pda if using token payment
    #[account(mut)]
    authority_pda_payment_account: Option<UncheckedAccount<'info>>,

    /// Seller of the tokens
    /// CHECK: Safe due to gumball machine constraint
    #[account(mut)]
    authority: UncheckedAccount<'info>,

    /// Payment account for authority if using token payment
    #[account(mut)]
    authority_payment_account: Option<UncheckedAccount<'info>>,

    /// Seller of the item
    /// CHECK: Safe due to item check
    #[account(mut)]
    seller: UncheckedAccount<'info>,

    /// Payment account for seller if using token payment
    #[account(mut)]
    seller_payment_account: Option<UncheckedAccount<'info>>,

    /// Seller history account.
    #[account(
        mut,
        seeds = [
            SELLER_HISTORY_SEED.as_bytes(),
            gumball_machine.key().as_ref(),
            seller.key().as_ref()
        ],
        bump
    )]
    seller_history: Box<Account<'info, SellerHistory>>,

    /// Payment mint if using non-native payment token
    payment_mint: Option<UncheckedAccount<'info>>,

    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,

    /// CHECK: Safe due to item check
    mint: Box<Account<'info, Mint>>,

    /// CHECK: Safe due to transfer check
    #[account(mut)]
    seller_token_account: UncheckedAccount<'info>,

    /// CHECK: Safe due to transfer check
    #[account(mut)]
    authority_pda_token_account: UncheckedAccount<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SettleTokensSaleClaimedArgs {
    pub start_index: u32,
    pub end_index: u32,
}

pub fn settle_tokens_sale_claimed<'info>(
    ctx: Context<'_, '_, '_, 'info, SettleTokensSaleClaimed<'info>>,
    args: SettleTokensSaleClaimedArgs,
) -> Result<()> {
    // Validate start and end indices
    require!(
        args.start_index <= args.end_index,
        GumballError::InvalidInputLength
    );

    // Initialize account variables
    let gumball_machine = &mut ctx.accounts.gumball_machine;
    let seller_history = &mut ctx.accounts.seller_history;
    let payer = &ctx.accounts.payer.to_account_info();
    let seller_token_account = &ctx.accounts.seller_token_account.to_account_info();
    let authority_pda = &mut ctx.accounts.authority_pda.to_account_info();
    let authority = &mut ctx.accounts.authority.to_account_info();
    let seller = &mut ctx.accounts.seller.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let associated_token_program = &ctx.accounts.associated_token_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let rent = &ctx.accounts.rent.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();
    let mint_key = mint.key();
    let seller_key = seller.key();

    // Set up payment accounts
    let payment_mint_info = ctx
        .accounts
        .payment_mint
        .as_ref()
        .map(|mint| mint.to_account_info());
    let payment_mint = payment_mint_info.as_ref();

    let authority_pda_payment_account_info = ctx
        .accounts
        .authority_pda_payment_account
        .as_ref()
        .map(|account| account.to_account_info());
    let authority_pda_payment_account = authority_pda_payment_account_info.as_ref();

    let authority_payment_account_info = ctx
        .accounts
        .authority_payment_account
        .as_ref()
        .map(|account| account.to_account_info());
    let authority_payment_account = authority_payment_account_info.as_ref();

    let seller_payment_account_info = ctx
        .accounts
        .seller_payment_account
        .as_ref()
        .map(|account| account.to_account_info());
    let seller_payment_account = seller_payment_account_info.as_ref();

    let auth_seeds = [
        AUTHORITY_SEED.as_bytes(),
        gumball_machine.to_account_info().key.as_ref(),
        &[ctx.bumps.authority_pda],
    ];

    // Access the account data for batch processing
    let account_info = gumball_machine.to_account_info();
    let mut account_data = account_info.data.borrow_mut();

    let config_count = get_config_count(&account_data)? as u64;
    if args.end_index >= config_count as u32 {
        return err!(GumballError::IndexGreaterThanLength);
    }

    // Batch process all items in the span
    let mut total_unsold_tokens = 0_u64;
    let total_items_settled = args.end_index - args.start_index + 1;
    let claimed_bit_mask_start = gumball_machine.get_claimed_items_bit_mask_position();
    let settled_bit_mask_start = gumball_machine.get_settled_items_bit_mask_position()?;

    // First pass: Mark all items as claimed and settled and count unsold tokens
    for idx in args.start_index..=args.end_index {
        let (claimed_byte_position, _bit, claimed_mask) =
            crate::get_bit_byte_info(claimed_bit_mask_start, idx as usize)?;
        let claimed_current_value = account_data[claimed_byte_position];
        let is_claimed = claimed_current_value & claimed_mask == claimed_mask;

        let config_line_position =
            GUMBALL_MACHINE_SIZE + 4 + (idx as usize) * gumball_machine.get_config_line_size();

        let mint = Pubkey::try_from(&account_data[config_line_position..config_line_position + 32])
            .unwrap();
        require!(mint_key == mint, GumballError::InvalidMint);

        let seller =
            Pubkey::try_from(&account_data[config_line_position + 32..config_line_position + 64])
                .unwrap();
        // Only the gumball machine authority or the seller can remove a config line
        require!(seller_key == seller, GumballError::InvalidSeller);

        let buyer =
            Pubkey::try_from(&account_data[config_line_position + 64..config_line_position + 96])
                .unwrap();
        let is_unsold = buyer == Pubkey::default();
        require!(is_unsold || is_claimed, GumballError::InvalidBuyer);

        let token_standard =
            u8::from_le_bytes(*array_ref![account_data, config_line_position + 96, 1]);
        require!(
            TokenStandard::Fungible as u8 == token_standard,
            GumballError::InvalidTokenStandard
        );

        // For each item, mark it as claimed if not already claimed (for unsold items only)
        if !is_claimed {
            // Only unsold items can be claimed
            require!(is_unsold, GumballError::InvalidBuyer);

            // Mark as claimed
            account_data[claimed_byte_position] |= claimed_mask;

            // Get the amount of tokens for this item
            let config_line_size = gumball_machine.get_config_line_size();
            let config_line_position =
                crate::constants::GUMBALL_MACHINE_SIZE + 4 + (idx as usize) * config_line_size;

            let amount = u64::from_le_bytes(
                account_data[config_line_position + crate::constants::CONFIG_LINE_SIZE
                    ..config_line_position + crate::constants::CONFIG_LINE_SIZE + 8]
                    .try_into()
                    .unwrap(),
            );

            total_unsold_tokens = total_unsold_tokens
                .checked_add(amount)
                .ok_or(GumballError::NumericalOverflowError)?;
        }

        // Mark each item as settled if not already settled
        let (settled_byte_position, _bit, settled_mask) =
            crate::get_bit_byte_info(settled_bit_mask_start, idx as usize)?;
        let settled_current_value = account_data[settled_byte_position];
        let is_settled = settled_current_value & settled_mask == settled_mask;
        require!(!is_settled, GumballError::ItemAlreadySettled);

        // Mark as settled
        account_data[settled_byte_position] |= settled_mask;
    }

    let mut total_proceeds_settled = gumball_machine.get_total_proceeds_settled(&account_data)?;

    let (mut total_proceeds, _) =
        get_total_proceeds(gumball_machine, total_proceeds_settled, config_count)?;

    total_proceeds = total_proceeds
        .checked_mul(total_items_settled as u64)
        .ok_or(GumballError::NumericalOverflowError)?;

    if gumball_machine.version >= 5 {
        total_proceeds_settled = total_proceeds_settled
            .checked_add(total_proceeds)
            .ok_or(GumballError::NumericalOverflowError)?;
        // Update the total proceeds settled
        let total_proceeds_settled_position = gumball_machine.get_total_proceeds_settled_position()?;
        account_data[total_proceeds_settled_position..total_proceeds_settled_position + 8]
            .copy_from_slice(&total_proceeds_settled.to_le_bytes());
    }

    // Done with the data borrow
    drop(account_data);

    // If there are unsold tokens, transfer them back to the seller
    if total_unsold_tokens > 0 {
        // Convert the authority_pda_token_account to TokenAccount type
        let authority_pda_token_account = &mut Box::new(try_from!(
            Account::<TokenAccount>,
            ctx.accounts.authority_pda_token_account
        )?);

        transfer_and_close_if_empty(
            payer,
            authority_pda,
            authority_pda_token_account,
            seller,
            seller_token_account,
            mint,
            token_program,
            associated_token_program,
            system_program,
            rent,
            seller,
            &auth_seeds,
            total_unsold_tokens,
        )?;
    }

    transfer_proceeds(
        gumball_machine,
        total_proceeds,
        0,
        authority_pda,
        authority,
        authority_pda_payment_account,
        authority_payment_account,
        seller,
        seller_payment_account,
        None,
        None,
        payment_mint,
        payer,
        associated_token_program,
        token_program,
        system_program,
        rent,
        &auth_seeds,
        &RoyaltyInfo::default(),
        true,
        true,
        ctx.remaining_accounts,
    )?;

    seller_history.item_count -= total_items_settled as u64;
    if seller_history.item_count == 0 {
        seller_history.close(seller.to_account_info())?;
    }

    // Update the items_settled counter once for all settled items
    gumball_machine.items_settled += total_items_settled as u64;

    // Emit event for the settled items
    emit_cpi!(SettleItemSaleEvent {
        mint: mint.key(),
        authority: gumball_machine.authority.key(),
        seller: seller.key(),
        buyer: Pubkey::default(), // Use default since this is for unsold tokens
        total_proceeds,
        payment_mint: gumball_machine.settings.payment_mint,
        fee_config: gumball_machine.marketplace_fee_config,
        curator_fee_bps: gumball_machine.settings.curator_fee_bps,
        amount: total_unsold_tokens
    });

    Ok(())
}
