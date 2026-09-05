import { createV1 } from '@metaplex-foundation/mpl-core';
import { generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
import { JellybeanState } from '../src';
import {
  addCoreItem,
  createClient,
  createCoreAsset,
  createJellybeanMachine,
  createMasterEdition,
  DEFAULT_MAX_SUPPLY,
  fetchJellybeanMachineWithItems,
  getDefaultFeeAccounts,
  startSale,
} from './_setup';

test('it can add a one-of-one asset to a jellybean machine', async (t) => {
  const client = await createClient();
  const uri = 'https://example.com/metadata.json';
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: { feeAccounts: getDefaultFeeAccounts(client.payer.address), uri },
  });

  const asset = await createCoreAsset(client.umi);
  await addCoreItem(client, { jellybeanMachine, asset: asset.publicKey });

  const account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);

  t.like(account, {
    version: 0,
    authority: client.payer.address,
    mintAuthority: client.payer.address,
    itemsLoaded: 1,
    supplyLoaded: 1n,
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
    feeAccounts: [{ address: client.payer.address, basisPoints: 10000 }],
    items: [
      {
        index: 0,
        mint: asset.publicKey,
        supplyLoaded: 1,
        supplyRedeemed: 0,
        supplyClaimed: 0,
      },
    ],
  });
});

test('it can add a master edition asset to a jellybean machine', async (t) => {
  const client = await createClient();
  const uri = 'https://example.com/metadata.json';
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: { feeAccounts: getDefaultFeeAccounts(client.payer.address), uri },
  });

  const collection = await createMasterEdition(client.umi);
  await addCoreItem(client, {
    jellybeanMachine,
    collection: collection.publicKey,
  });

  const account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);

  t.like(account, {
    version: 0,
    authority: client.payer.address,
    mintAuthority: client.payer.address,
    itemsLoaded: 1,
    supplyLoaded: BigInt(DEFAULT_MAX_SUPPLY),
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
    feeAccounts: [{ address: client.payer.address, basisPoints: 10000 }],
    items: [
      {
        index: 0,
        mint: collection.publicKey,
        supplyLoaded: DEFAULT_MAX_SUPPLY,
        supplyRedeemed: 0,
        supplyClaimed: 0,
      },
    ],
  });

  t.true(account.items[0].escrowAmount > 0);
});

test('it cannot add an item if the machine is started', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      feeAccounts: getDefaultFeeAccounts(client.payer.address),
      uri: 'https://example.com/metadata.json',
    },
  });

  const asset = await createCoreAsset(client.umi);
  await addCoreItem(client, { jellybeanMachine, asset: asset.publicKey });
  await startSale(client, jellybeanMachine);

  const asset2 = await createCoreAsset(client.umi);
  await t.throwsAsync(
    () => addCoreItem(client, { jellybeanMachine, asset: asset2.publicKey }),
    { message: /InvalidState/ }
  );
});

test('it cannot add a collection that is not a master edition', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      feeAccounts: getDefaultFeeAccounts(client.payer.address),
      uri: 'https://example.com/metadata.json',
    },
  });

  const collection = await createMasterEdition(client.umi, { plugins: [] });
  await t.throwsAsync(
    () =>
      addCoreItem(client, {
        jellybeanMachine,
        collection: collection.publicKey,
      }),
    { message: /MissingMasterEdition/ }
  );
});

test('it cannot add a master edition with infinite supply', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      feeAccounts: getDefaultFeeAccounts(client.payer.address),
      uri: 'https://example.com/metadata.json',
    },
  });

  const collection = await createMasterEdition(client.umi, {
    maxSupply: undefined,
  });
  await t.throwsAsync(
    () =>
      addCoreItem(client, {
        jellybeanMachine,
        collection: collection.publicKey,
      }),
    { message: /InvalidMasterEditionSupply/ }
  );
});

test('it cannot add a master edition with existing prints', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      feeAccounts: getDefaultFeeAccounts(client.payer.address),
      uri: 'https://example.com/metadata.json',
    },
  });

  const collection = await createMasterEdition(client.umi);

  // Mint a print from the master edition.
  await createV1(client.umi, {
    asset: generateSigner(client.umi),
    collection: collection.publicKey,
    name: 'My Asset',
    uri: 'https://example.com/my-asset.json',
  }).sendAndConfirm(client.umi);

  await t.throwsAsync(
    () =>
      addCoreItem(client, {
        jellybeanMachine,
        collection: collection.publicKey,
      }),
    { message: /MasterEditionNotEmpty/ }
  );
});
