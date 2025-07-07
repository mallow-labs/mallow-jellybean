import { generateSigner } from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  endSale,
  fetchJellybeanMachine,
  JellybeanState,
  startSale,
} from '../src';
import { create, createCoreAsset, createUmi } from './_setup';

test('it can start a sale', async (t) => {
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

  // Verify initial state is None
  let jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.state, JellybeanState.None);

  // Start the sale
  await startSale(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  // Verify state changed to SaleLive
  jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleLive);
});

test('it fails to start a sale with invalid authority', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const assetSigner = await createCoreAsset(umi);

  // Create jellybean machine with default authority
  await create(umi, {
    jellybeanMachine,
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Create a different signer (not the authority)
  const unauthorizedSigner = await generateSignerWithSol(umi);
  const unauthorizedUmi = await createUmi(unauthorizedSigner);

  // Try to start sale with unauthorized signer
  await t.throwsAsync(
    () =>
      startSale(unauthorizedUmi, {
        jellybeanMachine: jellybeanMachine.publicKey,
      }).sendAndConfirm(unauthorizedUmi),
    {
      message: /InvalidAuthority/,
    }
  );
});

test('it fails to start a sale with an empty jellybean machine', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);

  // Create jellybean machine with no items
  await create(umi, {
    jellybeanMachine,
    startSale: false,
    items: [], // Empty items array
  });

  // Verify machine is empty
  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);
  t.is(jellybeanMachineAccount.state, JellybeanState.None);

  // Try to start sale with empty machine
  await t.throwsAsync(
    () =>
      startSale(umi, {
        jellybeanMachine: jellybeanMachine.publicKey,
      }).sendAndConfirm(umi),
    {
      message: /JellybeanMachineEmpty/,
    }
  );
});

test('it fails to start a sale that is already live', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const assetSigner = await createCoreAsset(umi);

  // Create jellybean machine and start sale
  await create(umi, {
    jellybeanMachine,
    startSale: true, // Already start the sale
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Verify state is SaleLive
  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleLive);

  // Try to start sale again
  await t.throwsAsync(
    () =>
      startSale(umi, {
        jellybeanMachine: jellybeanMachine.publicKey,
      }).sendAndConfirm(umi),
    {
      message: /InvalidState/,
    }
  );
});

test('it fails to start a sale that is already ended', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const assetSigner = await createCoreAsset(umi);

  // Create jellybean machine and start sale
  await create(umi, {
    jellybeanMachine,
    startSale: true,
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // End the sale
  await endSale(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  // Verify state is SaleEnded
  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleEnded);

  // Try to start sale again
  await t.throwsAsync(
    () =>
      startSale(umi, {
        jellybeanMachine: jellybeanMachine.publicKey,
      }).sendAndConfirm(umi),
    {
      message: /InvalidState/,
    }
  );
});

test('it can start multiple sales for different jellybean machines', async (t) => {
  const umi = await createUmi();

  // Create first jellybean machine
  const jellybeanMachine1 = generateSigner(umi);
  const assetSigner1 = await createCoreAsset(umi);

  await create(umi, {
    jellybeanMachine: jellybeanMachine1,
    startSale: false,
    items: [
      {
        asset: assetSigner1.publicKey,
      },
    ],
  });

  // Create second jellybean machine
  const jellybeanMachine2 = generateSigner(umi);
  const assetSigner2 = await createCoreAsset(umi);

  await create(umi, {
    jellybeanMachine: jellybeanMachine2,
    startSale: false,
    items: [
      {
        asset: assetSigner2.publicKey,
      },
    ],
  });

  // Start both sales
  await startSale(umi, {
    jellybeanMachine: jellybeanMachine1.publicKey,
  }).sendAndConfirm(umi);

  await startSale(umi, {
    jellybeanMachine: jellybeanMachine2.publicKey,
  }).sendAndConfirm(umi);

  // Verify both are live
  const jellybeanMachine1Account = await fetchJellybeanMachine(
    umi,
    jellybeanMachine1.publicKey
  );
  const jellybeanMachine2Account = await fetchJellybeanMachine(
    umi,
    jellybeanMachine2.publicKey
  );

  t.is(jellybeanMachine1Account.state, JellybeanState.SaleLive);
  t.is(jellybeanMachine2Account.state, JellybeanState.SaleLive);
});

test('it can start a sale with multiple items loaded', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const assetSigner1 = await createCoreAsset(umi);
  const assetSigner2 = await createCoreAsset(umi);
  const assetSigner3 = await createCoreAsset(umi);

  // Create jellybean machine with multiple items
  await create(umi, {
    jellybeanMachine,
    startSale: false,
    items: [
      {
        asset: assetSigner1.publicKey,
      },
      {
        asset: assetSigner2.publicKey,
      },
      {
        asset: assetSigner3.publicKey,
      },
    ],
  });

  // Verify multiple items are loaded
  let jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 3);
  t.is(jellybeanMachineAccount.state, JellybeanState.None);

  // Start the sale
  await startSale(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  // Verify state changed to SaleLive
  jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleLive);
  t.is(jellybeanMachineAccount.itemsLoaded, 3);
});
