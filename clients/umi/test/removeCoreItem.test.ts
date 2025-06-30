import { fetchAsset, fetchCollection } from '@metaplex-foundation/mpl-core';
import { isGreaterThanAmount } from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  addCoreItem,
  fetchJellybeanMachineWithItems,
  JellybeanState,
  removeCoreItem,
} from '../src';
import {
  create,
  createCoreAsset,
  createMasterEdition,
  createUmi,
  DEFAULT_MAX_SUPPLY,
} from './_setup';

test('it can remove a one-of-one asset from a jellybean machine', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Verify the asset was added
  let jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 1);
  t.is(jellybeanMachineAccount.supplyLoaded, 1n);

  // Verify the asset is owned by the authority PDA before removal
  let asset = await fetchAsset(umi, assetSigner.publicKey);
  t.not(asset.owner, umi.identity.publicKey);

  // Remove the asset
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify the asset was removed from the jellybean machine
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);
  t.is(jellybeanMachineAccount.supplyLoaded, 0n);

  // Verify the asset is now owned by the authority
  asset = await fetchAsset(umi, assetSigner.publicKey);
  t.is(asset.owner, umi.identity.publicKey);
});

test('it can remove a collection (master edition) from a jellybean machine', async (t) => {
  const umi = await createUmi();
  const collectionSigner = await createMasterEdition(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
  });

  // Verify the collection was added
  let jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 1);
  t.is(jellybeanMachineAccount.supplyLoaded, BigInt(DEFAULT_MAX_SUPPLY));

  // Remove the collection
  await removeCoreItem(umi, {
    jellybeanMachine,
    collection: collectionSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify the collection was removed from the jellybean machine
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);
  t.is(jellybeanMachineAccount.supplyLoaded, 0n);

  // Verify the collection update authority is back to the original authority
  const collection = await fetchCollection(umi, collectionSigner.publicKey);
  t.is(collection.updateAuthority, umi.identity.publicKey);
});

test('it can remove an asset that is part of a collection', async (t) => {
  const umi = await createUmi();
  const collectionSigner = await createMasterEdition(umi, {
    plugins: [],
  });
  const assetSigner = await createCoreAsset(umi, {
    collection: collectionSigner,
  });

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
        collection: collectionSigner.publicKey,
      },
    ],
  });

  // Verify the asset was added
  let jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 1);
  t.is(jellybeanMachineAccount.supplyLoaded, 1n);

  // Remove the asset
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    collection: collectionSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify the asset was removed from the jellybean machine
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);
  t.is(jellybeanMachineAccount.supplyLoaded, 0n);

  // Verify the asset is now owned by the authority
  const asset = await fetchAsset(umi, assetSigner.publicKey);
  t.is(asset.owner, umi.identity.publicKey);
});

test('it can remove multiple items by removing them one by one', async (t) => {
  const umi = await createUmi();
  const asset1Signer = await createCoreAsset(umi);
  const asset2Signer = await createCoreAsset(umi);
  const collectionSigner = await createMasterEdition(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: asset1Signer.publicKey,
      },
      {
        asset: asset2Signer.publicKey,
      },
      {
        collection: collectionSigner.publicKey,
      },
    ],
  });

  // Verify all items were added
  let jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 3);
  t.is(jellybeanMachineAccount.supplyLoaded, BigInt(2 + DEFAULT_MAX_SUPPLY));

  // Remove the first asset (index 0)
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: asset1Signer.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify first asset was removed
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 2);
  t.is(jellybeanMachineAccount.supplyLoaded, BigInt(1 + DEFAULT_MAX_SUPPLY));

  // Remove the collection (now at index 1 after first removal)
  await removeCoreItem(umi, {
    jellybeanMachine,
    collection: collectionSigner.publicKey,
    index: 1,
  }).sendAndConfirm(umi);

  // Verify collection was removed
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 1);
  t.is(jellybeanMachineAccount.supplyLoaded, 1n);

  // Remove the last asset (now at index 0)
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: asset2Signer.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify all items were removed
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);
  t.is(jellybeanMachineAccount.supplyLoaded, 0n);
});

test('it fails when trying to remove with invalid authority', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);
  const invalidAuthority = await generateSignerWithSol(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Try to remove with invalid authority
  const promise = removeCoreItem(await createUmi(invalidAuthority), {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(await createUmi(invalidAuthority));

  await t.throwsAsync(promise, { message: /InvalidAuthority/ });
});

test('it fails when trying to remove from a jellybean machine that has started sale', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
  });

  // Verify the sale has started
  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleLive);

  // Try to remove item from a live sale
  const promise = removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /InvalidState/ });
});

test('it fails when trying to remove with invalid index', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Try to remove with index out of bounds
  const promise = removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 1, // Only index 0 exists
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise);
});

test('it fails when trying to remove without providing asset or collection', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Try to remove without providing asset or collection
  const promise = removeCoreItem(umi, {
    jellybeanMachine,
    index: 0,
    // Neither asset nor collection provided
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /InvalidAsset/ });
});

test('it fails when trying to remove with mismatched asset', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);
  const wrongAssetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Try to remove with wrong asset
  const promise = removeCoreItem(umi, {
    jellybeanMachine,
    asset: wrongAssetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /Invalid asset/ });
});

test('it fails when trying to remove with mismatched collection', async (t) => {
  const umi = await createUmi();
  const collectionSigner = await createMasterEdition(umi);
  const wrongCollectionSigner = await createMasterEdition(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
  });

  // Try to remove with wrong asset
  const promise = removeCoreItem(umi, {
    jellybeanMachine,
    collection: wrongCollectionSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /Invalid collection/ });
});

test('it can re-add an asset after removing it', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Remove the asset
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify the asset was removed
  let jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);

  // Re-add the asset
  await addCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
  }).sendAndConfirm(umi);

  // Verify the asset was re-added
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 1);
  t.is(jellybeanMachineAccount.supplyLoaded, 1n);
});

test('it returns rent for machine use when removing an asset', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  const initialBalance = await umi.rpc.getBalance(umi.identity.publicKey);

  // Remove the asset
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  const finalBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  t.is(
    isGreaterThanAmount(finalBalance, initialBalance),
    true,
    `Final balance ${finalBalance.basisPoints} should be greater than initial balance ${initialBalance.basisPoints}`
  );
});
