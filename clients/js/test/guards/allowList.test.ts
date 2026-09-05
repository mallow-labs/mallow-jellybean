import test from 'ava';
import {
  createClient,
  createCoreAsset,
  fetchJellybeanMachine,
  sendTransaction,
} from '../_setup';
import {
  createBuyer,
  createGuarded,
  drawJellybean,
  getMerkleProof,
  getMerkleRoot,
  MachineType,
  route,
  some,
} from '../guard';

const OTHER_ADDRESSES = [
  'Ur1CbWSGsXCdedknRbJsEk7urwAvu1uddmQv51nAnXB',
  'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS',
  '2vjCrmEFiN9CLLhiqy8u1JPh48av8Zpzp3kNkdTtirYG',
  'AT8nPwujHAD14cLojTcB1qdBzA1VXnT6LVGuUd6Y73Cy',
];

test('it allows allow-listed user to draw', async (t) => {
  const client = await createClient();
  const buyer = await createBuyer(client);
  const allowList = [buyer.address, ...OTHER_ADDRESSES];
  const merkleRoot = getMerkleRoot(allowList);

  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await createGuarded(client, {
    items: [{ asset: asset.publicKey }],
    guards: { allowList: some({ merkleRoot }) },
  });

  await sendTransaction(client.svm, buyer, [
    await route({
      machine: jellybeanMachine,
      guard: 'allowList',
      routeArgs: {
        path: 'proof',
        merkleRoot,
        merkleProof: getMerkleProof(allowList, buyer.address),
      },
      payer: buyer,
      machineType: MachineType.Jellybean,
    }),
    await drawJellybean({
      jellybeanMachine,
      payer: buyer,
      buyer,
      mintArgs: { allowList: some({ merkleRoot }) },
    }),
  ]);

  t.is(fetchJellybeanMachine(client.svm, jellybeanMachine).supplyRedeemed, 1n);
});

test('it allows allow-listed user to draw with a different payer', async (t) => {
  const client = await createClient();
  const buyer = await createBuyer(client);
  const payer = await createBuyer(client);
  const allowList = [buyer.address, ...OTHER_ADDRESSES];
  const merkleRoot = getMerkleRoot(allowList);

  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await createGuarded(client, {
    items: [{ asset: asset.publicKey }],
    guards: { allowList: some({ merkleRoot }) },
  });

  await sendTransaction(client.svm, payer, [
    await route({
      machine: jellybeanMachine,
      guard: 'allowList',
      routeArgs: {
        path: 'proof',
        merkleRoot,
        merkleProof: getMerkleProof(allowList, buyer.address),
        buyer: buyer.address,
      },
      payer,
      machineType: MachineType.Jellybean,
    }),
    await drawJellybean({
      jellybeanMachine,
      payer,
      buyer,
      mintArgs: { allowList: some({ merkleRoot }) },
    }),
  ]);

  t.is(fetchJellybeanMachine(client.svm, jellybeanMachine).supplyRedeemed, 1n);
});

test('it allows allow-listed user to draw with a different payer using guard group', async (t) => {
  const client = await createClient();
  const buyer = await createBuyer(client);
  const payer = await createBuyer(client);
  const allowList = [buyer.address, ...OTHER_ADDRESSES];
  const merkleRoot = getMerkleRoot(allowList);

  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await createGuarded(client, {
    items: [{ asset: asset.publicKey }],
    groups: [{ label: '0', guards: { allowList: some({ merkleRoot }) } }],
  });

  await sendTransaction(client.svm, payer, [
    await route({
      machine: jellybeanMachine,
      guard: 'allowList',
      routeArgs: {
        path: 'proof',
        merkleRoot,
        merkleProof: getMerkleProof(allowList, buyer.address),
        buyer: buyer.address,
      },
      payer,
      machineType: MachineType.Jellybean,
      group: some('0'),
    }),
    await drawJellybean({
      jellybeanMachine,
      payer,
      buyer,
      mintArgs: { allowList: some({ merkleRoot }) },
      group: some('0'),
    }),
  ]);

  t.is(fetchJellybeanMachine(client.svm, jellybeanMachine).supplyRedeemed, 1n);
});
