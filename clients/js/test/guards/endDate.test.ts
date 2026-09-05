import test from 'ava';
import {
  createClient,
  createCoreAsset,
  fetchJellybeanMachine,
  sol,
} from '../_setup';
import {
  createBuyer,
  createGuarded,
  drawGuarded,
  some,
  tomorrow,
  yesterday,
} from '../guard';

test('it allows minting before the end date', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await createGuarded(client, {
    items: [{ asset: asset.publicKey }],
    startSale: true,
    guards: {
      solPayment: some({ lamports: sol(0.1) }),
      endDate: some({ date: tomorrow() }),
    },
  });

  const buyer = await createBuyer(client);
  await drawGuarded(client, buyer, {
    jellybeanMachine,
    mintArgs: { solPayment: some({ feeAccounts: [client.payer.address] }) },
  });

  t.is(fetchJellybeanMachine(client.svm, jellybeanMachine).supplyRedeemed, 1n);
});

test('it forbids minting after the end date', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await createGuarded(client, {
    items: [{ asset: asset.publicKey }],
    startSale: true,
    guards: {
      solPayment: some({ lamports: sol(0.1) }),
      endDate: some({ date: yesterday() }),
    },
  });

  const buyer = await createBuyer(client);
  await t.throwsAsync(
    () =>
      drawGuarded(client, buyer, {
        jellybeanMachine,
        mintArgs: { solPayment: some({ feeAccounts: [client.payer.address] }) },
      }),
    { message: /AfterEndDate/ }
  );
});
