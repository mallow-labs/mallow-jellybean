import { drawJellybean } from '@mallow-labs/mallow-gumball';
import { generateSigner, some } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  claimCoreItem,
  closeJellybeanMachine,
  createJellybeanMachine,
  removeCoreItem,
  safeFetchJellybeanMachine,
  withdraw,
} from '../src/';
import {
  create,
  createCoreAsset,
  createUmi,
  getDefaultFeeAccounts,
} from './_setup';

test('it can close a jellybean machine', async (t) => {
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

  await withdraw(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await safeFetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.falsy(jellybeanMachineAccount);
});

test('it can close a jellybean machine with a guard', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  await create(umi, {
    jellybeanMachine,
    args: { feeAccounts, uri },
  });

  await closeJellybeanMachine(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await safeFetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.falsy(jellybeanMachineAccount);
});

test('it fails to withdraw when items are still loaded', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Try to withdraw while items are still loaded
  const promise = closeJellybeanMachine(umi, {
    jellybeanMachine,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /ItemsStillLoaded/ });
});

test('it can close a jellybean machine after removing all items', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  await removeCoreItem(umi, {
    jellybeanMachine,
    index: 0,
    asset: assetSigner.publicKey,
  }).sendAndConfirm(umi);

  await closeJellybeanMachine(umi, {
    jellybeanMachine,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await safeFetchJellybeanMachine(
    umi,
    jellybeanMachine
  );
  t.falsy(jellybeanMachineAccount);
});

test('it fails to withdraw when there are unclaimed prizes', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    startSale: true,
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  const buyerUmi = await createUmi();
  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [umi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  // The prize is drawn but not claimed.
  const promise = closeJellybeanMachine(umi, {
    jellybeanMachine,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /ItemsStillLoaded/ });
});

test('it can close a jellybean machine after settling all items', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    startSale: true,
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  const buyerUmi = await createUmi();
  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [umi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  await claimCoreItem(buyerUmi, {
    jellybeanMachine,
    index: 0,
    asset: assetSigner.publicKey,
  }).sendAndConfirm(buyerUmi);

  await removeCoreItem(umi, {
    jellybeanMachine,
    index: 0,
    asset: assetSigner.publicKey,
  }).sendAndConfirm(umi);

  await closeJellybeanMachine(umi, {
    jellybeanMachine,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await safeFetchJellybeanMachine(
    umi,
    jellybeanMachine
  );
  t.falsy(jellybeanMachineAccount);
});
