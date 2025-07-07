import { generateSigner } from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import { endSale, fetchJellybeanMachine, JellybeanState } from '../src';
import { create, createCoreAsset, createUmi } from './_setup';

test('it can end a sale', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const assetSigner = await createCoreAsset(umi);

  await create(umi, {
    jellybeanMachine,
    startSale: true,
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  await endSale(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleEnded);
});

test('it fails to end a sale with invalid authority', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const assetSigner = await createCoreAsset(umi);

  await create(umi, {
    jellybeanMachine,
    startSale: true,
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Create a different signer (not the authority)
  const unauthorizedSigner = await generateSignerWithSol(umi);
  const unauthorizedUmi = await createUmi(unauthorizedSigner);

  await t.throwsAsync(
    () =>
      endSale(unauthorizedUmi, {
        jellybeanMachine: jellybeanMachine.publicKey,
      }).sendAndConfirm(unauthorizedUmi),
    {
      message: /constraint was violated/,
    }
  );
});

test('it fails to end a sale that is already ended', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const assetSigner = await createCoreAsset(umi);

  await create(umi, {
    jellybeanMachine,
    startSale: true,
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // First call to end sale should succeed
  await endSale(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  // Second call to end sale should fail with InvalidState
  await t.throwsAsync(
    () =>
      endSale(umi, {
        jellybeanMachine: jellybeanMachine.publicKey,
      }).sendAndConfirm(umi),
    {
      message: /InvalidState/,
    }
  );
});

test('it can end a sale from None state', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const assetSigner = await createCoreAsset(umi);

  // Create jellybean machine without starting sale (state = None)
  await create(umi, {
    jellybeanMachine,
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  const initialAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(initialAccount.state, JellybeanState.None);

  // Should be able to end sale from None state
  await endSale(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  const finalAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(finalAccount.state, JellybeanState.SaleEnded);
});

test('it can end a sale with custom authority', async (t) => {
  const umi = await createUmi();
  const customAuthority = await generateSignerWithSol(umi);
  const customUmi = await createUmi(customAuthority);
  const jellybeanMachine = generateSigner(umi);
  const assetSigner = await createCoreAsset(customUmi);

  // Create jellybean machine with custom authority using the custom authority's UMI
  await create(customUmi, {
    jellybeanMachine,
    startSale: true,
    guards: {}, // No guards to avoid gumball guard complications
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Custom authority should be able to end the sale
  await endSale(customUmi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(customUmi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    customUmi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleEnded);
});

test('it maintains other jellybean machine data when ending sale', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const assetSigner = await createCoreAsset(umi);

  await create(umi, {
    jellybeanMachine,
    startSale: true,
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Get initial state
  const initialAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );

  await endSale(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  const finalAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );

  // State should change to SaleEnded
  t.is(finalAccount.state, JellybeanState.SaleEnded);

  // Other fields should remain the same
  t.is(finalAccount.authority, initialAccount.authority);
  t.is(finalAccount.mintAuthority, initialAccount.mintAuthority);
  t.is(finalAccount.itemsLoaded, initialAccount.itemsLoaded);
  t.is(finalAccount.supplyLoaded, initialAccount.supplyLoaded);
  t.is(finalAccount.supplyRedeemed, initialAccount.supplyRedeemed);
  t.is(finalAccount.uri, initialAccount.uri);
  t.deepEqual(finalAccount.feeAccounts, initialAccount.feeAccounts);
});
