import test from 'ava';
import { getStartSaleInstruction, JellybeanState } from '../src';
import {
  create,
  createClient,
  createCoreAsset,
  endSale,
  fetchJellybeanMachine,
  generateKeyPairSignerWithSol,
  sendTransaction,
  startSale,
} from './_setup';

test('it can start a sale', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  t.is(
    fetchJellybeanMachine(client.svm, jellybeanMachine).state,
    JellybeanState.None
  );

  await startSale(client, jellybeanMachine);

  t.is(
    fetchJellybeanMachine(client.svm, jellybeanMachine).state,
    JellybeanState.SaleLive
  );
});

test('it fails to start a sale with invalid authority', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  const unauthorized = await generateKeyPairSignerWithSol(client.svm);

  await t.throwsAsync(
    () =>
      sendTransaction(client.svm, unauthorized, [
        getStartSaleInstruction({ jellybeanMachine, authority: unauthorized }),
      ]),
    { message: /InvalidAuthority/ }
  );
});

test('it fails to start a sale with an empty jellybean machine', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await create(client, { items: [] });

  const account = fetchJellybeanMachine(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 0);
  t.is(account.state, JellybeanState.None);

  await t.throwsAsync(
    () =>
      sendTransaction(client.svm, client.payer, [
        getStartSaleInstruction({
          jellybeanMachine,
          authority: client.payer,
        }),
      ]),
    { message: /JellybeanMachineEmpty/ }
  );
});

test('it fails to start a sale that is already live', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    startSale: true,
    items: [{ asset: asset.publicKey }],
  });

  t.is(
    fetchJellybeanMachine(client.svm, jellybeanMachine).state,
    JellybeanState.SaleLive
  );

  await t.throwsAsync(
    () =>
      sendTransaction(client.svm, client.payer, [
        getStartSaleInstruction({
          jellybeanMachine,
          authority: client.payer,
        }),
      ]),
    { message: /InvalidState/ }
  );
});

test('it fails to start a sale that is already ended', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    startSale: true,
    items: [{ asset: asset.publicKey }],
  });

  await endSale(client, jellybeanMachine);

  t.is(
    fetchJellybeanMachine(client.svm, jellybeanMachine).state,
    JellybeanState.SaleEnded
  );

  await t.throwsAsync(
    () =>
      sendTransaction(client.svm, client.payer, [
        getStartSaleInstruction({
          jellybeanMachine,
          authority: client.payer,
        }),
      ]),
    { message: /InvalidState/ }
  );
});

test('it can start multiple sales for different jellybean machines', async (t) => {
  const client = await createClient();
  const asset1 = await createCoreAsset(client.umi);
  const jellybeanMachine1 = await create(client, {
    items: [{ asset: asset1.publicKey }],
  });

  const asset2 = await createCoreAsset(client.umi);
  const jellybeanMachine2 = await create(client, {
    items: [{ asset: asset2.publicKey }],
  });

  await startSale(client, jellybeanMachine1);
  await startSale(client, jellybeanMachine2);

  t.is(
    fetchJellybeanMachine(client.svm, jellybeanMachine1).state,
    JellybeanState.SaleLive
  );
  t.is(
    fetchJellybeanMachine(client.svm, jellybeanMachine2).state,
    JellybeanState.SaleLive
  );
});

test('it can start a sale with multiple items loaded', async (t) => {
  const client = await createClient();
  const asset1 = await createCoreAsset(client.umi);
  const asset2 = await createCoreAsset(client.umi);
  const asset3 = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [
      { asset: asset1.publicKey },
      { asset: asset2.publicKey },
      { asset: asset3.publicKey },
    ],
  });

  let account = fetchJellybeanMachine(client.svm, jellybeanMachine);
  t.is(account.itemsLoaded, 3);
  t.is(account.state, JellybeanState.None);

  await startSale(client, jellybeanMachine);

  account = fetchJellybeanMachine(client.svm, jellybeanMachine);
  t.is(account.state, JellybeanState.SaleLive);
  t.is(account.itemsLoaded, 3);
});
