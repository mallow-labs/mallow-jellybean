import { drawJellybean } from '@mallow-labs/mallow-gumball';
import { fetchToken } from '@metaplex-foundation/mpl-toolbox';
import { generateSigner, some } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  create,
  createCoreAsset,
  createMasterEdition,
  createMintWithHolders,
  createUmi,
} from '../_setup';

test('it transfers tokens to the correct user', async (t) => {
  const sellerUmi = await createUmi();
  const buyerUmi = await createUmi();
  const assetSigner = await createCoreAsset(sellerUmi);
  const [tokenMintSigner, sellerAta, buyerAta] = await createMintWithHolders(
    sellerUmi,
    {
      holders: [
        {
          owner: sellerUmi.identity.publicKey,
          amount: 0n,
        },
        {
          owner: buyerUmi.identity.publicKey,
          amount: 1000n,
        },
      ],
    }
  );

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
    guards: {
      tokenPayment: {
        mint: tokenMintSigner.publicKey,
        amount: 1000n,
      },
    },
  });

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      tokenPayment: some({
        mint: tokenMintSigner.publicKey,
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  const sellerBalance = await fetchToken(sellerUmi, sellerAta);
  t.is(sellerBalance.amount, 1000n);

  const buyerBalance = await fetchToken(buyerUmi, buyerAta);
  t.is(buyerBalance.amount, 0n);
});

test('it fails when fee account is not provided', async (t) => {
  const sellerUmi = await createUmi();
  const buyerUmi = await createUmi();
  const assetSigner = await createCoreAsset(sellerUmi);
  const [tokenMintSigner] = await createMintWithHolders(sellerUmi, {
    holders: [
      {
        owner: buyerUmi.identity.publicKey,
        amount: 1000n,
      },
    ],
  });

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
    guards: {
      tokenPayment: {
        mint: tokenMintSigner.publicKey,
        amount: 1000n,
      },
    },
  });

  await t.throwsAsync(
    () =>
      drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: {
          tokenPayment: some({
            mint: tokenMintSigner.publicKey,
            feeAccounts: [],
          }),
        },
      }).sendAndConfirm(buyerUmi),
    { message: /MissingRemainingAccount/ }
  );
});

test('it fails when fee account is incorrect', async (t) => {
  const sellerUmi = await createUmi();
  const buyerUmi = await createUmi();
  const assetSigner = await createCoreAsset(sellerUmi);
  const [tokenMintSigner] = await createMintWithHolders(sellerUmi, {
    holders: [
      {
        owner: buyerUmi.identity.publicKey,
        amount: 1000n,
      },
    ],
  });

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
    guards: {
      tokenPayment: {
        mint: tokenMintSigner.publicKey,
        amount: 1000n,
      },
    },
  });

  await t.throwsAsync(
    () =>
      drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: {
          tokenPayment: some({
            mint: tokenMintSigner.publicKey,
            feeAccounts: [buyerUmi.identity.publicKey],
          }),
        },
      }).sendAndConfirm(buyerUmi),
    { message: /Invalid token account owner/ }
  );
});

test('it transfers to all fee accounts according to their basis points', async (t) => {
  const sellerUmi = await createUmi();
  const buyerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi);
  const feeAccounts = Array.from({ length: 6 }, () =>
    generateSigner(sellerUmi)
  );
  const amount = 1_000_000_000n;

  const [tokenMintSigner, buyerAta, ...feeAtas] = await createMintWithHolders(
    sellerUmi,
    {
      holders: [
        {
          owner: buyerUmi.identity.publicKey,
          amount,
        },
        ...feeAccounts.map((feeAccount) => ({
          owner: feeAccount.publicKey,
          amount: 0n,
        })),
      ],
    }
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
    guards: {
      tokenPayment: {
        mint: tokenMintSigner.publicKey,
        amount,
      },
    },
  });

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      tokenPayment: some({
        mint: tokenMintSigner.publicKey,
        feeAccounts: feeAccounts.map((feeAccount) => feeAccount.publicKey),
      }),
    },
  }).sendAndConfirm(buyerUmi);

  const balances = await Promise.all(
    feeAtas.map((feeAta) => fetchToken(sellerUmi, feeAta).then((t) => t.amount))
  );
  t.deepEqual(balances, [
    350_000_000n,
    110_000_000n,
    120_000_000n,
    130_000_000n,
    140_000_000n,
    150_000_000n,
  ]);

  const buyerBalance = await fetchToken(buyerUmi, buyerAta);
  t.is(buyerBalance.amount, 0n);
});
