import { fetchAsset, fetchCollection } from '@metaplex-foundation/mpl-core';
import test from 'ava';
import { getRemoveCoreItemInstructionAsync, JellybeanState } from '../src';
import {
  addCoreItem,
  claimCoreItem,
  create,
  createClient,
  createCoreAsset,
  createMasterEdition,
  DEFAULT_MAX_SUPPLY,
  draw,
  endSale,
  fetchJellybeanMachineWithItems,
  generateKeyPairSignerWithSol,
  getBalance,
  sameAddress,
  removeCoreItem,
  sendTransaction,
} from './_setup';

test('it can remove a one-of-one asset from a jellybean machine', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  let account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 1);
  t.is(account.supplyLoaded, 1n);

  // Owned by the authority PDA before removal.
  t.false(
    sameAddress(
      (await fetchAsset(client.umi, asset.publicKey)).owner,
      client.payer.address
    )
  );

  await removeCoreItem(client, {
    jellybeanMachine,
    asset: asset.publicKey,
    index: 0,
  });

  account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 0);
  t.is(account.supplyLoaded, 0n);
  t.true(
    sameAddress(
      (await fetchAsset(client.umi, asset.publicKey)).owner,
      client.payer.address
    )
  );
});

test('it can remove a master edition from a jellybean machine', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
  });

  let account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 1);
  t.is(account.supplyLoaded, BigInt(DEFAULT_MAX_SUPPLY));

  await removeCoreItem(client, {
    jellybeanMachine,
    collection: collection.publicKey,
    index: 0,
  });

  account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 0);
  t.is(account.supplyLoaded, 0n);
  t.true(
    sameAddress(
      (await fetchCollection(client.umi, collection.publicKey)).updateAuthority,
      client.payer.address
    )
  );
});

test('it can remove an asset that is part of a collection', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi, { plugins: [] });
  const asset = await createCoreAsset(client.umi, { collection });
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey, collection: collection.publicKey }],
  });

  let account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 1);
  t.is(account.supplyLoaded, 1n);

  await removeCoreItem(client, {
    jellybeanMachine,
    asset: asset.publicKey,
    collection: collection.publicKey,
    index: 0,
  });

  account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 0);
  t.is(account.supplyLoaded, 0n);
  t.true(
    sameAddress(
      (await fetchAsset(client.umi, asset.publicKey)).owner,
      client.payer.address
    )
  );
});

test('it can remove multiple items by removing them one by one', async (t) => {
  const client = await createClient();
  const asset1 = await createCoreAsset(client.umi);
  const asset2 = await createCoreAsset(client.umi);
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [
      { asset: asset1.publicKey },
      { asset: asset2.publicKey },
      { collection: collection.publicKey },
    ],
  });

  let account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 3);
  t.is(account.supplyLoaded, BigInt(2 + DEFAULT_MAX_SUPPLY));

  await removeCoreItem(client, {
    jellybeanMachine,
    asset: asset1.publicKey,
    index: 0,
  });
  account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 2);
  t.is(account.supplyLoaded, BigInt(1 + DEFAULT_MAX_SUPPLY));

  await removeCoreItem(client, {
    jellybeanMachine,
    collection: collection.publicKey,
    index: 1,
  });
  account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 1);
  t.is(account.supplyLoaded, 1n);

  await removeCoreItem(client, {
    jellybeanMachine,
    asset: asset2.publicKey,
    index: 0,
  });
  account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 0);
  t.is(account.supplyLoaded, 0n);
});

test('it fails when trying to remove with invalid authority', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  const invalidAuthority = await generateKeyPairSignerWithSol(client.svm);
  const ix = await getRemoveCoreItemInstructionAsync({
    jellybeanMachine,
    authority: invalidAuthority,
    asset: asset.publicKey as never,
    index: 0,
  });
  await t.throwsAsync(
    () => sendTransaction(client.svm, invalidAuthority, [ix]),
    { message: /InvalidAuthority/ }
  );
});

test('it fails when trying to remove from a jellybean machine that has started sale', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
    startSale: true,
  });

  t.is(
    fetchJellybeanMachineWithItems(client.svm, jellybeanMachine).state,
    JellybeanState.SaleLive
  );

  await t.throwsAsync(
    () =>
      removeCoreItem(client, {
        jellybeanMachine,
        asset: asset.publicKey,
        index: 0,
      }),
    { message: /InvalidState/ }
  );
});

test('it fails when trying to remove with invalid index', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  await t.throwsAsync(() =>
    removeCoreItem(client, {
      jellybeanMachine,
      asset: asset.publicKey,
      index: 1, // Only index 0 exists.
    })
  );
});

test('it fails when trying to remove without providing asset or collection', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  await t.throwsAsync(
    () => removeCoreItem(client, { jellybeanMachine, index: 0 }),
    { message: /InvalidAsset/ }
  );
});

test('it fails when trying to remove with mismatched asset', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const wrongAsset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  await t.throwsAsync(
    () =>
      removeCoreItem(client, {
        jellybeanMachine,
        asset: wrongAsset.publicKey,
        index: 0,
      }),
    { message: /Invalid asset/ }
  );
});

test('it fails when trying to remove with mismatched collection', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const wrongCollection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
  });

  await t.throwsAsync(
    () =>
      removeCoreItem(client, {
        jellybeanMachine,
        collection: wrongCollection.publicKey,
        index: 0,
      }),
    { message: /Invalid collection/ }
  );
});

test('it can re-add an asset after removing it', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  await removeCoreItem(client, {
    jellybeanMachine,
    asset: asset.publicKey,
    index: 0,
  });
  t.is(
    fetchJellybeanMachineWithItems(client.svm, jellybeanMachine).itemsLoaded,
    0
  );

  await addCoreItem(client, { jellybeanMachine, asset: asset.publicKey });
  const account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 1);
  t.is(account.supplyLoaded, 1n);
});

test('it returns rent for machine use when removing an asset', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  const initialBalance = getBalance(client.svm, client.payer.address);
  await removeCoreItem(client, {
    jellybeanMachine,
    asset: asset.publicKey,
    index: 0,
  });
  const finalBalance = getBalance(client.svm, client.payer.address);
  t.true(finalBalance > initialBalance);
});

test('it can remove a one-of-one asset after being claimed', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });
  await claimCoreItem(client, {
    jellybeanMachine,
    buyer: buyer.address,
    payer: buyer,
    asset: asset.publicKey,
    index: 0,
  });

  await removeCoreItem(client, {
    jellybeanMachine,
    asset: asset.publicKey,
    index: 0,
  });

  const account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 0);
  t.is(account.supplyLoaded, 0n);
  t.true(
    sameAddress((await fetchAsset(client.umi, asset.publicKey)).owner, buyer.address)
  );
});

test('it fails when trying to remove a one-of-one asset before being claimed', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  await t.throwsAsync(
    () =>
      removeCoreItem(client, {
        jellybeanMachine,
        asset: asset.publicKey,
        index: 0,
      }),
    { message: /ItemNotFullyClaimed/ }
  );
});

test('it fails when trying to remove a master edition before sale has ended', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  await t.throwsAsync(
    () =>
      removeCoreItem(client, {
        jellybeanMachine,
        collection: collection.publicKey,
        index: 0,
      }),
    { message: /InvalidState/ }
  );
});

test('it can remove the first item when there are multiple items', async (t) => {
  const client = await createClient();
  const assets = await Promise.all([
    createCoreAsset(client.umi),
    createCoreAsset(client.umi),
  ]);
  const jellybeanMachine = await create(client, {
    items: [{ asset: assets[0].publicKey }, { asset: assets[1].publicKey }],
  });

  await removeCoreItem(client, {
    jellybeanMachine,
    asset: assets[0].publicKey,
    index: 0,
  });

  const account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 1);
  t.is(account.supplyLoaded, 1n);
  t.is(account.items.length, 1);
  t.true(sameAddress(account.items[0].mint, assets[1].publicKey));
});

test('it fails when trying to remove a master edition before being fully claimed', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });
  await endSale(client, jellybeanMachine);

  await t.throwsAsync(
    () =>
      removeCoreItem(client, {
        jellybeanMachine,
        collection: collection.publicKey,
        index: 0,
      }),
    { message: /ItemNotFullyClaimed/ }
  );
});
