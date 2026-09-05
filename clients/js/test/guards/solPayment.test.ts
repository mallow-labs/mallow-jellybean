import { generateKeyPairSigner } from '@solana/kit';
import test from 'ava';
import {
  createClient,
  createCoreAsset,
  createMasterEdition,
  getBalance,
} from '../_setup';
import { createBuyer, createGuarded, drawGuarded, some } from '../guard';

// DEFAULT_SOL_PAYMENT_LAMPORTS = sol(0.1) = 100_000_000 lamports.
const SOL_PAYMENT = 100_000_000n;

test('it transfers funds to the correct user', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await createGuarded(client, {
    items: [{ asset: asset.publicKey }],
  });

  const buyer = await createBuyer(client);
  const initialBalance = getBalance(client.svm, client.payer.address);

  await drawGuarded(client, buyer, {
    jellybeanMachine,
    mintArgs: { solPayment: some({ feeAccounts: [client.payer.address] }) },
  });

  const finalBalance = getBalance(client.svm, client.payer.address);
  t.is(finalBalance, initialBalance + SOL_PAYMENT);
});

test('it fails when fee account is not provided', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await createGuarded(client, {
    items: [{ asset: asset.publicKey }],
  });

  const buyer = await createBuyer(client);
  await t.throwsAsync(
    () =>
      drawGuarded(client, buyer, {
        jellybeanMachine,
        mintArgs: { solPayment: some({ feeAccounts: [] }) },
      }),
    { message: /MissingRemainingAccount/ }
  );
});

test('it fails when fee account is incorrect', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await createGuarded(client, {
    items: [{ asset: asset.publicKey }],
  });

  const buyer = await createBuyer(client);
  await t.throwsAsync(
    () =>
      drawGuarded(client, buyer, {
        jellybeanMachine,
        mintArgs: {
          solPayment: some({ feeAccounts: [buyer.address] }),
        },
      }),
    { message: /Invalid fee account address/ }
  );
});

test('it transfers to all fee accounts according to their basis points', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const feeAccounts = await Promise.all(
    Array.from({ length: 6 }, () => generateKeyPairSigner())
  );

  const jellybeanMachine = await createGuarded(client, {
    uri: 'https://example.com',
    feeAccounts: feeAccounts.map((feeAccount, i) => ({
      address: feeAccount.address,
      basisPoints: i === 0 ? 3500 : 1000 + i * 100,
    })),
    items: [{ collection: collection.publicKey }],
  });

  const buyer = await createBuyer(client);
  await drawGuarded(client, buyer, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: feeAccounts.map((feeAccount) => feeAccount.address),
      }),
    },
  });

  const balances = feeAccounts.map((feeAccount) =>
    getBalance(client.svm, feeAccount.address)
  );
  t.deepEqual(balances, [
    35_000_000n,
    11_000_000n,
    12_000_000n,
    13_000_000n,
    14_000_000n,
    15_000_000n,
  ]);
});
