use crate::{constants::AUTHORITY_SEED, state::JellybeanMachine, JellybeanError, LoadedItem};
use anchor_lang::prelude::*;
use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1, PluginHeaderV1},
    errors::MplCoreError,
    fetch_plugin,
    instructions::{TransferV1CpiBuilder, UpdateCollectionV1CpiBuilder},
    types::{
        ExternalPluginAdapterType, MasterEdition, PluginAuthority, PluginType, UpdateAuthority,
        UpdateDelegate,
    },
    DataBlob, PluginRegistryV1Safe, SolanaAccount,
};

/// Add core asset to a jellybean machine.
#[derive(Accounts)]
pub struct AddCoreItem<'info> {
    /// Gumball Machine account.
    #[account(
        mut,
        has_one = authority @ JellybeanError::InvalidAuthority,
        constraint = jellybean_machine.can_add_items() @ JellybeanError::InvalidState,
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

    /// Authority of the jellybean machine.
    #[account(mut)]
    authority: Signer<'info>,

    /// Payer for account reallocation
    #[account(mut)]
    payer: Signer<'info>,

    /// CHECK: Safe due to freeze
    #[account(mut)]
    asset: Option<UncheckedAccount<'info>>,

    /// Core asset's collection if it's part of one.
    /// CHECK: Verified in mpl_core processors
    #[account(mut)]
    collection: Option<UncheckedAccount<'info>>,

    /// CHECK: Safe due to address constraint
    #[account(address = mpl_core::ID)]
    mpl_core_program: UncheckedAccount<'info>,

    system_program: Program<'info, System>,
}

/// The plugins an item may carry once it is in custody. Everything else is
/// refused: the `Permanent*` delegates act on an asset whoever owns it, and a
/// plugin too new for this list cannot be assumed harmless.
///
/// Owner-managed delegates are safe here because mpl-core hands them back to the
/// new owner, the authority PDA, on the transfer into custody.
const LOADABLE_PLUGINS: [u8; 13] = [
    PluginType::Royalties as u8,
    PluginType::FreezeDelegate as u8,
    PluginType::BurnDelegate as u8,
    PluginType::TransferDelegate as u8,
    PluginType::UpdateDelegate as u8,
    PluginType::Attributes as u8,
    PluginType::Edition as u8,
    PluginType::MasterEdition as u8,
    PluginType::AddBlocker as u8,
    PluginType::ImmutableMetadata as u8,
    PluginType::VerifiedCreators as u8,
    PluginType::Autograph as u8,
    PluginType::FreezeExecute as u8,
];

/// The external plugin adapters that only hold data. The rest (Oracle and the
/// lifecycle hooks) can veto the claim's transfer or the edition print.
const LOADABLE_EXTERNAL_PLUGINS: [u8; 3] = [
    ExternalPluginAdapterType::AppData as u8,
    ExternalPluginAdapterType::LinkedAppData as u8,
    ExternalPluginAdapterType::DataSection as u8,
];

/// Reads a Core account's plugin registry, `None` when it has no plugin section.
/// Any other failure to read it is an error, so a registry that cannot be parsed
/// never passes as an empty one.
fn fetch_plugin_registry<T: DataBlob + SolanaAccount>(
    account: &AccountInfo,
) -> Result<Option<PluginRegistryV1Safe>> {
    require_keys_eq!(*account.owner, mpl_core::ID, JellybeanError::InvalidOwner);

    let base = T::load(account, 0).map_err(ProgramError::from)?;
    let data = account.data.borrow();
    if base.len() == data.len() {
        return Ok(None);
    }

    let header = PluginHeaderV1::from_bytes(&data[base.len()..])?;
    let registry =
        PluginRegistryV1Safe::from_bytes(&data[header.plugin_registry_offset as usize..])?;

    Ok(Some(registry))
}

/// Refuses a registry holding a plugin that lets someone act on a prize the
/// authority PDA holds.
fn assert_loadable_plugins(registry: &PluginRegistryV1Safe) -> Result<()> {
    require!(
        registry
            .registry
            .iter()
            .all(|record| LOADABLE_PLUGINS.contains(&record.plugin_type)),
        JellybeanError::RetainedItemControl
    );
    require!(
        registry
            .external_registry
            .iter()
            .all(|record| LOADABLE_EXTERNAL_PLUGINS.contains(&record.plugin_type)),
        JellybeanError::RetainedItemControl
    );

    Ok(())
}

/// A one-of-one stays deliverable only if nothing on it, or on the collection it
/// belongs to, can move, freeze or burn it in custody. The collection comes from
/// the asset, so leaving the account out cannot skip its check.
fn assert_asset_loadable(asset: &AccountInfo, collection: Option<&AccountInfo>) -> Result<()> {
    if let Some(registry) = fetch_plugin_registry::<BaseAssetV1>(asset)? {
        assert_loadable_plugins(&registry)?;
    }

    let base = BaseAssetV1::load(asset, 0).map_err(ProgramError::from)?;
    if let UpdateAuthority::Collection(expected) = base.update_authority {
        let collection = collection.ok_or(JellybeanError::InvalidAsset)?;
        require_keys_eq!(*collection.key, expected, JellybeanError::InvalidAsset);

        if let Some(registry) = fetch_plugin_registry::<BaseCollectionV1>(collection)? {
            assert_loadable_plugins(&registry)?;
        }
    }

    Ok(())
}

/// A master edition moves its update authority to the authority PDA, so on top of
/// the plugins above, nobody else may keep a say over the collection: a plugin
/// authority held by an address, or an update delegate, survives that move and
/// can strip the MasterEdition plugin every outstanding prize needs to print.
fn assert_master_edition_loadable(collection: &AccountInfo) -> Result<()> {
    let Some(registry) = fetch_plugin_registry::<BaseCollectionV1>(collection)? else {
        return Ok(());
    };

    assert_loadable_plugins(&registry)?;

    for record in registry.registry.iter() {
        require!(
            !matches!(record.authority, PluginAuthority::Address { .. }),
            JellybeanError::RetainedItemControl
        );

        if record.plugin_type == PluginType::UpdateDelegate as u8 {
            let update_delegate = fetch_plugin::<BaseCollectionV1, UpdateDelegate>(
                collection,
                PluginType::UpdateDelegate,
            )
            .map_err(ProgramError::from)?
            .1;
            require!(
                update_delegate.additional_delegates.is_empty(),
                JellybeanError::RetainedItemControl
            );
        }
    }

    Ok(())
}

pub fn add_core_item(ctx: Context<AddCoreItem>) -> Result<()> {
    let authority = &ctx.accounts.authority.to_account_info();
    let authority_pda = &ctx.accounts.authority_pda.to_account_info();
    let mpl_core_program = &ctx.accounts.mpl_core_program.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let payer = &ctx.accounts.payer.to_account_info();
    let jellybean_machine = &mut ctx.accounts.jellybean_machine;

    let collection_info = ctx
        .accounts
        .collection
        .as_ref()
        .map(|account| account.to_account_info());
    let collection = collection_info.as_ref();

    let loaded_item = if let Some(asset) = &ctx.accounts.asset {
        assert_asset_loadable(&asset.to_account_info(), collection)?;

        // Transfer the core asset to the authority pda
        TransferV1CpiBuilder::new(mpl_core_program)
            .asset(asset)
            .collection(collection)
            .payer(authority)
            .new_owner(authority_pda)
            .system_program(Some(system_program))
            .invoke()?;

        LoadedItem {
            mint: asset.key(),
            supply_loaded: 1,
            supply_redeemed: 0,
            supply_claimed: 0,
            escrow_amount: 0,
        }
    } else if let Some(collection_account) = &ctx.accounts.collection {
        let collection_info = collection_account.to_account_info();
        assert_master_edition_loadable(&collection_info)?;

        // Read only the base collection + the MasterEdition plugin. Materializing
        // the full `Collection` (its entire plugin list) overflows the SBF stack
        // under mpl-core 0.12, so fetch just what we need (matches mallow-utils).
        let base = BaseCollectionV1::from_bytes(&collection_info.data.borrow())?;

        require!(
            base.current_size == 0,
            JellybeanError::MasterEditionNotEmpty
        );

        let master_edition = fetch_plugin::<BaseCollectionV1, MasterEdition>(
            &collection_info,
            PluginType::MasterEdition,
        )
        .map_err(|e| {
            // Only a genuinely missing plugin maps to MissingMasterEdition; any other
            // failure (e.g. registry deserialization under mpl-core 0.12) is propagated.
            if e.to_string() == MplCoreError::PluginNotFound.to_string() {
                error!(JellybeanError::MissingMasterEdition)
            } else {
                ProgramError::from(e).into()
            }
        })?
        .1;

        if let Some(max_supply) = master_edition.max_supply {
            // Update the master edition authority to the authority pda
            UpdateCollectionV1CpiBuilder::new(mpl_core_program)
                .collection(collection_account)
                .payer(authority)
                .new_update_authority(Some(authority_pda))
                .system_program(system_program)
                .invoke()?;

            let rent = Rent::get()?;
            let current_size = base.current_size;
            let name = master_edition.name.unwrap_or(base.name);
            let uri = master_edition.uri.unwrap_or(base.uri);

            // We escrow funds from the buyer to cover printing fees, this allows the buyer or seller to settle the sale
            let escrow_amount =
            // AssetV1 + Edition plugin base size + name + uri size
                rent.minimum_balance(108_usize + name.len() + uri.len())
                    + 1_500_000; // Metaplex fee

            LoadedItem {
                mint: collection_account.key(),
                supply_loaded: max_supply,
                supply_redeemed: current_size,
                supply_claimed: 0,
                escrow_amount,
            }
        } else {
            return err!(JellybeanError::InvalidMasterEditionSupply);
        }
    } else {
        return err!(JellybeanError::InvalidAsset);
    };

    crate::processors::add_item(jellybean_machine, loaded_item, payer, system_program)?;

    Ok(())
}
