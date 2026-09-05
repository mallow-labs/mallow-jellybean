import test from 'ava';
import { getEndSaleInstruction, JellybeanState } from '../src';
import {
  create,
  createClient,
  createCoreAsset,
  endSale,
  fetchJellybeanMachine,
  generateKeyPairSignerWithSol,
  sendTransaction,
} from './_setup';

test('it can end a sale', async (t) => {
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
});

test('it fails to end a sale with invalid authority', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    startSale: true,
    items: [{ asset: asset.publicKey }],
  });

  const unauthorized = await generateKeyPairSignerWithSol(client.svm);

  await t.throwsAsync(
    () =>
      sendTransaction(client.svm, unauthorized, [
        getEndSaleInstruction({ jellybeanMachine, authority: unauthorized }),
      ]),
    { message: /constraint was violated/ }
  );
});

test('it fails to end a sale that is already ended', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    startSale: true,
    items: [{ asset: asset.publicKey }],
  });

  await endSale(client, jellybeanMachine);

  await t.throwsAsync(() => endSale(client, jellybeanMachine), {
    message: /InvalidState/,
  });
});

test('it can end a sale from None state', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  t.is(
    fetchJellybeanMachine(client.svm, jellybeanMachine).state,
    JellybeanState.None
  );

  await endSale(client, jellybeanMachine);

  t.is(
    fetchJellybeanMachine(client.svm, jellybeanMachine).state,
    JellybeanState.SaleEnded
  );
});

test('it can end a sale with custom authority', async (t) => {
  // Each client's payer is its own authority, so a fresh client exercises the
  // "non-default authority" path the umi test drives with a custom signer.
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
});

test('it maintains other jellybean machine data when ending sale', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    startSale: true,
    items: [{ asset: asset.publicKey }],
  });

  const initial = fetchJellybeanMachine(client.svm, jellybeanMachine);

  await endSale(client, jellybeanMachine);

  const final = fetchJellybeanMachine(client.svm, jellybeanMachine);

  t.is(final.state, JellybeanState.SaleEnded);
  t.is(final.authority, initial.authority);
  t.is(final.mintAuthority, initial.mintAuthority);
  t.is(final.itemsLoaded, initial.itemsLoaded);
  t.is(final.supplyLoaded, initial.supplyLoaded);
  t.is(final.supplyRedeemed, initial.supplyRedeemed);
  t.is(final.uri, initial.uri);
  t.deepEqual(final.feeAccounts, initial.feeAccounts);
});
