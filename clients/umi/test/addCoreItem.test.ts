import { generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  addCoreItem,
  createJellybeanMachine,
  fetchJellybeanMachineWithItems,
  JellybeanMachineWithItems,
  JellybeanState,
  startSale,
} from '../src';
import {
  createCoreAsset,
  createMasterEdition,
  createUmi,
  DEFAULT_MAX_SUPPLY,
  getDefaultFeeAccounts,
} from './_setup';

test('it can add a one-of-one asset to a jellybean machine', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  const asset = await createCoreAsset(umi);
  await addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    asset: asset.publicKey,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine.publicKey
  );

  t.like(jellybeanMachineAccount, <JellybeanMachineWithItems>{
    publicKey: jellybeanMachine.publicKey,
    version: 0,
    authority: umi.identity.publicKey,
    mintAuthority: umi.identity.publicKey,
    itemsLoaded: 1,
    supplyLoaded: 1n,
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
    feeAccounts: [
      {
        address: umi.identity.publicKey,
        basisPoints: 10000,
      },
    ],
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
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  const collection = await createMasterEdition(umi);
  await addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    collection: collection.publicKey,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine.publicKey
  );

  t.like(jellybeanMachineAccount, <JellybeanMachineWithItems>{
    publicKey: jellybeanMachine.publicKey,
    version: 0,
    authority: umi.identity.publicKey,
    mintAuthority: umi.identity.publicKey,
    itemsLoaded: 1,
    supplyLoaded: BigInt(DEFAULT_MAX_SUPPLY),
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
    feeAccounts: [
      {
        address: umi.identity.publicKey,
        basisPoints: 10000,
      },
    ],
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

  t.true(jellybeanMachineAccount.items[0].escrowAmount > 0);
});

test('it cannot add an item if the machine is started', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  const asset = await createCoreAsset(umi);
  await addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    asset: asset.publicKey,
  }).sendAndConfirm(umi);

  await startSale(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  const asset2 = await createCoreAsset(umi);
  const promise = addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    asset: asset2.publicKey,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, {
    message: /InvalidState/,
  });
});

test('it cannot add a collection that is not a master edition', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  const collection = await createMasterEdition(umi, {
    plugins: [],
  });
  const promise = addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    collection: collection.publicKey,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, {
    message: /MissingMasterEdition/,
  });
});

test('it cannot add a master edition with infinite supply', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  const collection = await createMasterEdition(umi, { maxSupply: undefined });
  const promise = addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    collection: collection.publicKey,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, {
    message: /InvalidMasterEditionSupply/,
  });
});
