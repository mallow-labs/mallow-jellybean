import test from 'ava';
import {
  claimCoreItem,
  create,
  createClient,
  createCoreAsset,
  createJellybeanMachine,
  draw,
  generateKeyPairSignerWithSol,
  getDefaultFeeAccounts,
  removeCoreItem,
  safeFetchJellybeanMachine,
  withdraw,
} from './_setup';

test('it can close a jellybean machine', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      feeAccounts: getDefaultFeeAccounts(client.payer.address),
      uri: 'https://example.com/metadata.json',
    },
  });

  await withdraw(client, jellybeanMachine);

  t.falsy(safeFetchJellybeanMachine(client.svm, jellybeanMachine));
});

test('it can close a jellybean machine with no items', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await create(client);

  await withdraw(client, jellybeanMachine);

  t.falsy(safeFetchJellybeanMachine(client.svm, jellybeanMachine));
});

test('it fails to withdraw when items are still loaded', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  await t.throwsAsync(() => withdraw(client, jellybeanMachine), {
    message: /ItemsStillLoaded/,
  });
});

test('it can close a jellybean machine after removing all items', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
  });

  await removeCoreItem(client, {
    jellybeanMachine,
    index: 0,
    asset: asset.publicKey,
  });
  await withdraw(client, jellybeanMachine);

  t.falsy(safeFetchJellybeanMachine(client.svm, jellybeanMachine));
});

test('it fails to withdraw when there are unclaimed prizes', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    startSale: true,
    items: [{ asset: asset.publicKey }],
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  // The prize is drawn but not claimed.
  await t.throwsAsync(() => withdraw(client, jellybeanMachine), {
    message: /ItemsStillLoaded/,
  });
});

test('it can close a jellybean machine after settling all items', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    startSale: true,
    items: [{ asset: asset.publicKey }],
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
    index: 0,
    asset: asset.publicKey,
  });
  await withdraw(client, jellybeanMachine);

  t.falsy(safeFetchJellybeanMachine(client.svm, jellybeanMachine));
});
