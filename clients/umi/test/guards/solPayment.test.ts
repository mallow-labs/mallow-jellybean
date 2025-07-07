import { drawJellybean } from '@mallow-labs/mallow-gumball';
import {
  addAmounts,
  generateSigner,
  isEqualToAmount,
  lamports,
  some,
} from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  create,
  createCoreAsset,
  createMasterEdition,
  createUmi,
  DEFAULT_SOL_PAYMENT_LAMPORTS,
} from '../_setup';

test('it transfers funds to the correct user', async (t) => {
  const sellerUmi = await createUmi();
  const assetSigner = await createCoreAsset(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  const initialBalance = await sellerUmi.rpc.getBalance(
    sellerUmi.identity.publicKey
  );

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  const finalBalance = await sellerUmi.rpc.getBalance(
    sellerUmi.identity.publicKey
  );
  t.true(
    isEqualToAmount(
      finalBalance,
      addAmounts(initialBalance, DEFAULT_SOL_PAYMENT_LAMPORTS)
    )
  );
});

test('it fails when fee account is not provided', async (t) => {
  const sellerUmi = await createUmi();
  const assetSigner = await createCoreAsset(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await t.throwsAsync(
    () =>
      drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: {
          solPayment: some({
            feeAccounts: [],
          }),
        },
      }).sendAndConfirm(buyerUmi),
    { message: /MissingRemainingAccount/ }
  );
});

test('it fails when fee account is incorrect', async (t) => {
  const sellerUmi = await createUmi();
  const assetSigner = await createCoreAsset(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await t.throwsAsync(
    () =>
      drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: {
          solPayment: some({
            feeAccounts: [buyer.publicKey],
          }),
        },
      }).sendAndConfirm(buyerUmi),
    { message: /Invalid fee account address/ }
  );
});

test('it transfers to all fee accounts according to their basis points', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi);
  const feeAccounts = Array.from({ length: 6 }, () =>
    generateSigner(sellerUmi)
  );

  const jellybeanMachine = await create(sellerUmi, {
    args: {
      uri: 'https://example.com',
      feeAccounts: feeAccounts.map((feeAccount, i) => ({
        address: feeAccount.publicKey,
        basisPoints: i === 0 ? 3500 : 1000 + i * 100,
      })),
    },
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: feeAccounts.map((feeAccount) => feeAccount.publicKey),
      }),
    },
  }).sendAndConfirm(buyerUmi);

  const balances = await Promise.all(
    feeAccounts.map((feeAccount) =>
      sellerUmi.rpc.getBalance(feeAccount.publicKey)
    )
  );
  t.deepEqual(balances, [
    lamports(35_000_000),
    lamports(11_000_000),
    lamports(12_000_000),
    lamports(13_000_000),
    lamports(14_000_000),
    lamports(15_000_000),
  ]);
});
