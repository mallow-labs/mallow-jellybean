use crate::{
    constants::GUMBALL_MACHINE_SIZE, instructions::AddItemArgs, ConfigLine, ConfigLineV2,
    GumballError, GumballMachine, GumballState, SellerHistory, TokenStandard,
};
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use arrayref::array_ref;
use mpl_core::{
    accounts::BaseAssetV1,
    fetch_plugin,
    instructions::{
        AddPluginV1CpiBuilder, ApprovePluginAuthorityV1CpiBuilder, RemovePluginV1CpiBuilder,
        RevokePluginAuthorityV1CpiBuilder, UpdatePluginV1CpiBuilder,
    },
    types::{
        FreezeDelegate, Plugin, PluginAuthority, PluginType, TransferDelegate, UpdateAuthority,
    },
    Asset, Collection,
};
use mpl_token_metadata::{
    accounts::{Metadata, TokenRecord},
    instructions::{
        DelegateCpiBuilder, FreezeDelegatedAccountCpi, FreezeDelegatedAccountCpiAccounts,
        LockCpiBuilder, RevokeCpiBuilder, ThawDelegatedAccountCpi, ThawDelegatedAccountCpiAccounts,
        UnlockCpiBuilder,
    },
    types::{
        AuthorizationData, DelegateArgs, LockArgs, ProgrammableConfig, RevokeArgs,
        TokenDelegateRole, TokenStandard as MplTokenStandard, UnlockArgs,
    },
};
use solana_program::{
    account_info::AccountInfo,
    program::invoke,
    program_memory::sol_memcmp,
    pubkey::{Pubkey, PUBKEY_BYTES},
};
use spl_token::instruction::approve;
use utils::{assert_keys_equal, get_auth_payload, transfer_spl, verify_proof};

/// Anchor wrapper for Token program.
#[derive(Debug, Clone)]
pub struct Token;

impl anchor_lang::Id for Token {
    fn id() -> Pubkey {
        spl_token::id()
    }
}

/// Anchor wrapper for Associated Token program.
#[derive(Debug, Clone)]
pub struct AssociatedToken;

impl anchor_lang::Id for AssociatedToken {
    fn id() -> Pubkey {
        spl_associated_token_account::id()
    }
}

pub fn assert_can_add_item(
    gumball_machine: &mut Box<Account<GumballMachine>>,
    seller_history: &mut Box<Account<SellerHistory>>,
    quantity: u16,
    args: &AddItemArgs,
) -> Result<()> {
    let AddItemArgs {
        seller_proof_path,
        index,
    } = args;

    // Having an index means we're re-adding an item
    if index.is_some() {
        // Can only add item back to a live solo gumball
        require!(!gumball_machine.is_collab(), GumballError::NotASoloGumball);
        require!(
            gumball_machine.state == GumballState::SaleLive,
            GumballError::InvalidState
        );
    }

    let seller = seller_history.seller;

    if seller == gumball_machine.authority {
        return Ok(());
    }

    if seller_history.item_count + quantity as u64
        > gumball_machine.settings.items_per_seller as u64
    {
        return err!(GumballError::SellerTooManyItems);
    }

    if seller_proof_path.is_none() || gumball_machine.settings.sellers_merkle_root.is_none() {
        return err!(GumballError::InvalidProofPath);
    }

    let leaf = solana_program::keccak::hashv(&[seller.to_string().as_bytes()]);
    require!(
        verify_proof(
            &seller_proof_path.as_ref().unwrap()[..],
            &gumball_machine.settings.sellers_merkle_root.unwrap(),
            &leaf.0,
        ),
        GumballError::InvalidProofPath
    );

    Ok(())
}

pub fn assert_can_request_add_item(
    gumball_machine: &mut Box<Account<GumballMachine>>,
    seller_history: &mut Box<Account<SellerHistory>>,
) -> Result<()> {
    let seller = seller_history.seller;

    if seller == gumball_machine.authority {
        return err!(GumballError::SellerCannotBeAuthority);
    }

    if seller_history.item_count >= gumball_machine.settings.items_per_seller as u64 {
        return err!(GumballError::SellerTooManyItems);
    }

    Ok(())
}

pub fn assert_config_line(
    gumball_machine: &Box<Account<GumballMachine>>,
    index: u32,
    config_line: ConfigLine,
    is_burnt: bool,
) -> Result<()> {
    let account_info = gumball_machine.to_account_info();
    let data = account_info.data.borrow();
    let count = get_config_count(&data)?;

    if index >= count as u32 {
        return err!(GumballError::IndexGreaterThanLength);
    }

    let config_line_position =
        GUMBALL_MACHINE_SIZE + 4 + (index as usize) * gumball_machine.get_config_line_size();

    let mint = Pubkey::try_from(&data[config_line_position..config_line_position + 32]).unwrap();
    require!(config_line.mint == mint, GumballError::InvalidMint);

    let seller =
        Pubkey::try_from(&data[config_line_position + 32..config_line_position + 64]).unwrap();
    // Only the gumball machine authority or the seller can remove a config line
    require!(config_line.seller == seller, GumballError::InvalidSeller);

    let buyer =
        Pubkey::try_from(&data[config_line_position + 64..config_line_position + 96]).unwrap();
    require!(config_line.buyer == buyer, GumballError::InvalidBuyer);

    // No need to verify the token standard for burnt assets
    if !is_burnt {
        let token_standard = u8::from_le_bytes(*array_ref![data, config_line_position + 96, 1]);
        require!(
            config_line.token_standard as u8 == token_standard,
            GumballError::InvalidTokenStandard
        );
    }

    drop(data);

    Ok(())
}

pub fn assert_config_line_values(
    gumball_machine_data: &[u8],
    config_line_position: usize,
    index: u32,
    mint: Pubkey,
    seller: Pubkey,
    buyer: Pubkey,
) -> Result<ConfigLineV2> {
    let count = get_config_count(gumball_machine_data)?;

    if index >= count as u32 {
        return err!(GumballError::IndexGreaterThanLength);
    }

    let config_line = ConfigLineV2::try_from_slice(
        &gumball_machine_data
            [config_line_position..config_line_position + ConfigLineV2::INIT_SPACE],
    )?;

    require!(mint == config_line.mint, GumballError::InvalidMint);
    require!(seller == config_line.seller, GumballError::InvalidSeller);
    require!(buyer == config_line.buyer, GumballError::InvalidBuyer);

    Ok(config_line)
}

/// Return the current number of lines written to the account.
pub fn get_config_count(data: &[u8]) -> Result<usize> {
    Ok(u32::from_le_bytes(*array_ref![data, GUMBALL_MACHINE_SIZE, 4]) as usize)
}

pub fn cmp_pubkeys(a: &Pubkey, b: &Pubkey) -> bool {
    sol_memcmp(a.as_ref(), b.as_ref(), PUBKEY_BYTES) == 0
}

pub fn get_core_asset_update_authority<'info>(
    asset_info: &AccountInfo<'info>,
    collection_info: Option<&AccountInfo<'info>>,
) -> Result<(Option<Pubkey>, Box<Asset>)> {
    // Considered a primary sale if owner is the update authority (most likely creator)
    let asset = Box::<Asset>::try_from(asset_info)?;
    match asset.base.update_authority {
        UpdateAuthority::Address(address) => {
            return Ok((Some(address), asset));
        }
        UpdateAuthority::Collection(collection_key) => {
            if let Some(collection_info) = collection_info {
                assert_keys_equal(
                    *collection_info.key,
                    collection_key,
                    "Invalid collection key",
                )?;
                let collection = Box::<Collection>::try_from(collection_info)?;
                return Ok((Some(collection.base.update_authority), asset));
            } else {
                return Ok((None, asset));
            }
        }
        UpdateAuthority::None => return Ok((None, asset)),
    }
}

pub fn get_bit_byte_info(base_position: usize, position: usize) -> Result<(usize, usize, u8)> {
    let byte_position = base_position
        + position
            .checked_div(8)
            .ok_or(GumballError::NumericalOverflowError)?;
    // bit index corresponding to the position of the line
    let bit = 7 - position
        .checked_rem(8)
        .ok_or(GumballError::NumericalOverflowError)?;
    let mask = u8::pow(2, bit as u32);

    return Ok((byte_position, bit, mask));
}

pub fn approve_and_freeze_core_asset<'a>(
    payer: &AccountInfo<'a>,
    asset_info: &AccountInfo<'a>,
    collection: Option<&AccountInfo<'a>>,
    new_authority_info: &AccountInfo<'a>,
    new_authority_seeds: &[&[u8]],
    mpl_core_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
) -> Result<()> {
    let new_authority = new_authority_info.key();

    // Approve
    if let Err(_) =
        fetch_plugin::<BaseAssetV1, TransferDelegate>(asset_info, PluginType::TransferDelegate)
    {
        AddPluginV1CpiBuilder::new(mpl_core_program)
            .asset(asset_info)
            .collection(collection)
            .payer(payer)
            .plugin(Plugin::TransferDelegate(TransferDelegate {}))
            .init_authority(PluginAuthority::Address {
                address: new_authority,
            })
            .system_program(system_program)
            .invoke()?;
    } else {
        ApprovePluginAuthorityV1CpiBuilder::new(mpl_core_program)
            .asset(asset_info)
            .collection(collection)
            .payer(payer)
            .new_authority(PluginAuthority::Address {
                address: new_authority,
            })
            .plugin_type(PluginType::TransferDelegate)
            .system_program(system_program)
            .invoke()?;
    }

    // Freeze
    if let Err(_) =
        fetch_plugin::<BaseAssetV1, TransferDelegate>(asset_info, PluginType::FreezeDelegate)
    {
        AddPluginV1CpiBuilder::new(mpl_core_program)
            .asset(asset_info)
            .collection(collection)
            .payer(payer)
            .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: true }))
            .init_authority(PluginAuthority::Address {
                address: new_authority,
            })
            .system_program(system_program)
            .invoke_signed(&[&new_authority_seeds])?;
    } else {
        ApprovePluginAuthorityV1CpiBuilder::new(mpl_core_program)
            .asset(asset_info)
            .collection(collection)
            .payer(payer)
            .new_authority(PluginAuthority::Address {
                address: new_authority,
            })
            .plugin_type(PluginType::FreezeDelegate)
            .system_program(system_program)
            .invoke()?;

        UpdatePluginV1CpiBuilder::new(mpl_core_program)
            .asset(asset_info)
            .collection(collection)
            .payer(payer)
            .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: true }))
            .authority(Some(new_authority_info))
            .system_program(system_program)
            .invoke_signed(&[&new_authority_seeds])?;
    }

    Ok(())
}

pub fn thaw_and_revoke_core_asset<'a>(
    payer: &AccountInfo<'a>,
    owner: &AccountInfo<'a>,
    asset_info: &AccountInfo<'a>,
    collection: Option<&AccountInfo<'a>>,
    authority: &AccountInfo<'a>,
    authority_seeds: &[&[u8]],
    mpl_core_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
) -> Result<()> {
    // Thaw
    UpdatePluginV1CpiBuilder::new(mpl_core_program)
        .asset(asset_info)
        .collection(collection)
        .payer(payer)
        .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: false }))
        .authority(Some(authority))
        .system_program(system_program)
        .invoke_signed(&[&authority_seeds])?;

    // Can only remove plugins if the seller is the authority
    if owner.key() == payer.key() {
        // Clean up freeze plugin back to seller
        RemovePluginV1CpiBuilder::new(mpl_core_program)
            .asset(asset_info)
            .collection(collection)
            .payer(payer)
            .plugin_type(PluginType::FreezeDelegate)
            .system_program(system_program)
            .invoke()?;

        // Clean up transfer delegate plugin back to seller
        RemovePluginV1CpiBuilder::new(mpl_core_program)
            .asset(asset_info)
            .collection(collection)
            .payer(payer)
            .plugin_type(PluginType::TransferDelegate)
            .system_program(system_program)
            .invoke()?;
    } else {
        // Revoke
        RevokePluginAuthorityV1CpiBuilder::new(mpl_core_program)
            .asset(asset_info)
            .collection(collection)
            .payer(payer)
            .plugin_type(PluginType::FreezeDelegate)
            .authority(Some(authority))
            .system_program(system_program)
            .invoke_signed(&[&authority_seeds])?;

        // Revoke
        RevokePluginAuthorityV1CpiBuilder::new(mpl_core_program)
            .asset(asset_info)
            .collection(collection)
            .payer(payer)
            .plugin_type(PluginType::TransferDelegate)
            .authority(Some(authority))
            .system_program(system_program)
            .invoke_signed(&[&authority_seeds])?;
    }

    Ok(())
}

pub fn approve_and_freeze_nft_v2<'a>(
    payer: &AccountInfo<'a>,
    owner: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    token_account: &AccountInfo<'a>,
    edition: &AccountInfo<'a>,
    new_authority_info: &AccountInfo<'a>,
    new_authority_seeds: &[&[u8]],
    token_metadata_program: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    metadata_info: &AccountInfo<'a>,
    metadata: &Metadata,
    token_record: Option<&UncheckedAccount<'a>>,
    rules: Option<&UncheckedAccount<'a>>,
    system_program: &AccountInfo<'a>,
    sysvar_instructions: Option<&UncheckedAccount<'a>>,
    auth_rules_program: Option<&UncheckedAccount<'a>>,
) -> Result<()> {
    if let Some(sysvar_instructions) = sysvar_instructions {
        let mut delegate_builder = DelegateCpiBuilder::new(token_metadata_program);
        delegate_builder
            .delegate(new_authority_info)
            .authority(owner)
            .metadata(metadata_info)
            .master_edition(Some(edition))
            .mint(mint)
            .token(Some(token_account))
            .payer(owner)
            .spl_token_program(Some(token_program))
            .system_program(system_program)
            .sysvar_instructions(sysvar_instructions);

        let mut delegate_args = DelegateArgs::StandardV1 { amount: 1 };

        let mut lock_builder = LockCpiBuilder::new(token_metadata_program);
        lock_builder
            .authority(new_authority_info)
            .token(token_account)
            .mint(mint)
            .metadata(metadata_info)
            .edition(Some(edition))
            .payer(owner)
            .spl_token_program(Some(token_program))
            .system_program(system_program)
            .sysvar_instructions(sysvar_instructions);

        if let Some(standard) = &metadata.token_standard {
            if *standard == MplTokenStandard::ProgrammableNonFungible
                || *standard == MplTokenStandard::ProgrammableNonFungibleEdition
            {
                delegate_args = DelegateArgs::LockedTransferV1 {
                    amount: 1,
                    locked_address: new_authority_info.key(),
                    authorization_data: Some(AuthorizationData {
                        payload: get_auth_payload(new_authority_info),
                    }),
                };
                delegate_builder.token_record(token_record.map(|acc| acc.as_ref()));

                lock_builder.token_record(token_record.map(|acc| acc.as_ref()));
            }
        }

        if let Some(config) = &metadata.programmable_config {
            match *config {
                ProgrammableConfig::V1 { rule_set } => {
                    if let Some(_rule_set) = rule_set {
                        delegate_builder.authorization_rules_program(
                            auth_rules_program.map(|acc| acc.as_ref()),
                        );
                        delegate_builder.authorization_rules(rules.map(|acc| acc.as_ref()));

                        lock_builder.authorization_rules_program(
                            auth_rules_program.map(|acc| acc.as_ref()),
                        );
                        lock_builder.authorization_rules(rules.map(|acc| acc.as_ref()));
                    }
                }
            }
        }

        delegate_builder.delegate_args(delegate_args);
        delegate_builder.invoke()?;

        lock_builder.lock_args(LockArgs::V1 {
            authorization_data: Some(AuthorizationData {
                payload: get_auth_payload(new_authority_info),
            }),
        });
        lock_builder.invoke_signed(&[new_authority_seeds])?;
    } else {
        let approve_ix = approve(
            token_program.key,
            token_account.key,
            new_authority_info.key,
            payer.key,
            &[payer.key],
            1,
        )?;

        invoke(
            &approve_ix,
            &[
                token_program.to_account_info(),
                token_account.to_account_info(),
                new_authority_info.to_account_info(),
                payer.to_account_info(),
            ],
        )?;

        FreezeDelegatedAccountCpi::new(
            token_metadata_program,
            FreezeDelegatedAccountCpiAccounts {
                delegate: new_authority_info,
                token_account,
                edition,
                mint,
                token_program,
            },
        )
        .invoke_signed(&[&new_authority_seeds])?;
    }

    Ok(())
}

pub fn token_standard_from_mpl_token_standard(metadata: &Metadata) -> Result<TokenStandard> {
    if let Some(standard) = &metadata.token_standard {
        if *standard == MplTokenStandard::ProgrammableNonFungible
            || *standard == MplTokenStandard::ProgrammableNonFungibleEdition
        {
            return Ok(TokenStandard::ProgrammableNonFungible);
        }

        if *standard == MplTokenStandard::Fungible || *standard == MplTokenStandard::FungibleAsset {
            return Ok(TokenStandard::Fungible);
        }
    }

    Ok(TokenStandard::NonFungible)
}

pub fn thaw_and_revoke_nft_v2<'a>(
    payer: &AccountInfo<'a>,
    owner: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    token_account: &AccountInfo<'a>,
    edition: &AccountInfo<'a>,
    authority: &AccountInfo<'a>,
    authority_seeds: &[&[u8]],
    token_metadata_program: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    metadata_info: Option<&AccountInfo<'a>>,
    token_record: Option<&UncheckedAccount<'a>>,
    rules: Option<&UncheckedAccount<'a>>,
    system_program: &AccountInfo<'a>,
    sysvar_instructions: Option<&UncheckedAccount<'a>>,
    auth_rules_program: Option<&UncheckedAccount<'a>>,
    associated_token_program: &AccountInfo<'a>,
    authority_pda_token_account: &AccountInfo<'a>,
    rent: &AccountInfo<'a>,
) -> Result<()> {
    let metadata = if let Some(metadata_info) = metadata_info {
        Some(Metadata::try_from(metadata_info)?)
    } else {
        None
    };

    thaw_nft(
        payer,
        owner,
        mint,
        token_account,
        edition,
        authority,
        authority_seeds,
        token_metadata_program,
        token_program,
        metadata_info,
        metadata.as_ref(),
        token_record,
        rules,
        system_program,
        sysvar_instructions,
        auth_rules_program,
    )?;

    if let Some(sysvar_instructions) = sysvar_instructions {
        let mut revoke_builder = RevokeCpiBuilder::new(token_metadata_program);
        revoke_builder
            .delegate(authority)
            .authority(owner)
            .metadata(metadata_info.unwrap())
            .master_edition(Some(edition))
            .mint(mint)
            .token(Some(token_account))
            .payer(owner)
            .spl_token_program(Some(token_program))
            .system_program(system_program)
            .sysvar_instructions(sysvar_instructions);
        let mut revoke_args = RevokeArgs::StandardV1;

        if let Some(standard) = &metadata.as_ref().unwrap().token_standard {
            if *standard == MplTokenStandard::ProgrammableNonFungible
                || *standard == MplTokenStandard::ProgrammableNonFungibleEdition
            {
                let token_record_info = &token_record.unwrap().to_account_info();
                let token_record_data = TokenRecord::try_from(token_record_info)?;
                let delegate_role = token_record_data.delegate_role.unwrap();
                if delegate_role == TokenDelegateRole::Migration {
                    revoke_args = RevokeArgs::MigrationV1;
                } else {
                    revoke_args = RevokeArgs::LockedTransferV1;
                }
                revoke_builder.token_record(token_record.map(|acc| acc.as_ref()));
            }
        }

        if let Some(config) = &metadata.as_ref().unwrap().programmable_config {
            match *config {
                ProgrammableConfig::V1 { rule_set } => {
                    if let Some(_rule_set) = rule_set {
                        revoke_builder.authorization_rules_program(
                            auth_rules_program.map(|acc| acc.as_ref()),
                        );
                        revoke_builder.authorization_rules(rules.map(|acc| acc.as_ref()));
                    }
                }
            }
        }

        revoke_builder.revoke_args(revoke_args);
        revoke_builder.invoke()?;
    } else {
        transfer_spl(
            owner,
            authority,
            token_account,
            authority_pda_token_account,
            mint,
            payer,
            associated_token_program,
            token_program,
            system_program,
            rent,
            Some(authority),
            Some(authority_seeds),
            None,
            1,
        )?;

        transfer_spl(
            authority,
            owner,
            authority_pda_token_account,
            token_account,
            mint,
            payer,
            associated_token_program,
            token_program,
            system_program,
            rent,
            Some(authority),
            Some(authority_seeds),
            None,
            1,
        )?;
    }

    Ok(())
}

pub fn thaw_nft<'a>(
    payer: &AccountInfo<'a>,
    owner: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    token_account: &AccountInfo<'a>,
    edition: &AccountInfo<'a>,
    authority: &AccountInfo<'a>,
    authority_seeds: &[&[u8]],
    token_metadata_program: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    metadata_info: Option<&AccountInfo<'a>>,
    metadata: Option<&Metadata>,
    token_record: Option<&UncheckedAccount<'a>>,
    rules: Option<&UncheckedAccount<'a>>,
    system_program: &AccountInfo<'a>,
    sysvar_instructions: Option<&UncheckedAccount<'a>>,
    auth_rules_program: Option<&UncheckedAccount<'a>>,
) -> Result<()> {
    if let Some(sysvar_instructions) = sysvar_instructions {
        let mut unlock_builder = UnlockCpiBuilder::new(token_metadata_program);
        unlock_builder
            .authority(authority)
            .token_owner(Some(owner))
            .token(token_account)
            .mint(mint)
            .metadata(metadata_info.unwrap())
            .edition(Some(edition))
            .payer(payer)
            .spl_token_program(Some(token_program))
            .system_program(system_program)
            .sysvar_instructions(sysvar_instructions);

        if let Some(standard) = &metadata.unwrap().token_standard {
            if *standard == MplTokenStandard::ProgrammableNonFungible
                || *standard == MplTokenStandard::ProgrammableNonFungibleEdition
            {
                unlock_builder.token_record(token_record.map(|acc| acc.as_ref()));
            }
        }

        if let Some(config) = &metadata.unwrap().programmable_config {
            match *config {
                ProgrammableConfig::V1 { rule_set } => {
                    if let Some(_rule_set) = rule_set {
                        unlock_builder.authorization_rules_program(
                            auth_rules_program.map(|acc| acc.as_ref()),
                        );
                        unlock_builder.authorization_rules(rules.map(|acc| acc.as_ref()));
                    }
                }
            }
        }

        unlock_builder.unlock_args(UnlockArgs::V1 {
            authorization_data: Some(AuthorizationData {
                payload: get_auth_payload(authority),
            }),
        });
        unlock_builder.invoke_signed(&[authority_seeds])?;
    } else {
        ThawDelegatedAccountCpi::new(
            token_metadata_program,
            ThawDelegatedAccountCpiAccounts {
                delegate: authority,
                token_account,
                edition,
                mint,
                token_program,
            },
        )
        .invoke_signed(&[&authority_seeds])?;
    }

    Ok(())
}

pub fn transfer_and_close_if_empty<'a>(
    payer: &AccountInfo<'a>,
    authority: &AccountInfo<'a>,
    token_account: &mut Box<Account<'a, TokenAccount>>,
    recipient: &AccountInfo<'a>,
    recipient_token_account: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    associated_token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    rent: &AccountInfo<'a>,
    rent_recipient: &AccountInfo<'a>,
    auth_seeds: &[&[u8]],
    amount: u64,
) -> Result<()> {
    if amount > 0 {
        transfer_spl(
            authority,
            recipient,
            &token_account.to_account_info(),
            recipient_token_account,
            mint,
            payer,
            associated_token_program,
            token_program,
            system_program,
            rent,
            Some(authority),
            Some(&auth_seeds),
            None,
            amount,
        )?;
        token_account.reload()?;
    }

    // Close the token account back to authority if token account is empty
    if token_account.amount == 0 {
        solana_program::program::invoke_signed(
            &spl_token::instruction::close_account(
                token_program.key,
                token_account.to_account_info().key,
                rent_recipient.key,
                authority.key,
                &[],
            )?,
            &[
                token_program.to_account_info(),
                token_account.to_account_info(),
                rent_recipient.to_account_info(),
                authority.to_account_info(),
                system_program.to_account_info(),
            ],
            &[auth_seeds],
        )?;
    }

    Ok(())
}

#[macro_export]
macro_rules! try_from {
    ($ty: ty, $acc: expr) => {
        <$ty>::try_from(unsafe { std::mem::transmute::<_, &AccountInfo<'_>>($acc.as_ref()) })
    };
}

#[cfg(test)]
pub mod tests {
    use super::*;

    #[test]
    fn check_keys_equal() {
        let key1 = Pubkey::new_unique();
        assert!(cmp_pubkeys(&key1, &key1));
    }

    #[test]
    fn check_keys_not_equal() {
        let key1 = Pubkey::new_unique();
        let key2 = Pubkey::new_unique();
        assert!(!cmp_pubkeys(&key1, &key2));
    }
}
