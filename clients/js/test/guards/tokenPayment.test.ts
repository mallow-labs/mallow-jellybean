import { generateKeyPairSigner } from '@solana/kit';
import test from 'ava';
import { createClient, createCoreAsset, createMasterEdition } from '../_setup';
import {
  createBuyer,
  createGuarded,
  createMintWithHolders,
  drawGuarded,
  fetchToken,
  some,
} from '../guard';

test('it transfers tokens to the correct user', async (t) => {
  const client = await createClient();
  const buyer = await createBuyer(client);
  const asset = await createCoreAsset(client.umi);
  const [tokenMint, sellerAta, buyerAta] = await createMintWithHolders(
    client.umi,
    {
      holders: [
        { owner: client.payer.address, amount: 0n },
        { owner: buyer.address, amount: 1000n },
      ],
    }
  );

  const jellybeanMachine = await createGuarded(client, {
    items: [{ asset: asset.publicKey }],
    guards: {
      tokenPayment: { mint: tokenMint.publicKey, amount: 1000n },
    },
  });

  await drawGuarded(client, buyer, {
    jellybeanMachine,
    mintArgs: {
      tokenPayment: some({
        mint: tokenMint.publicKey,
        feeAccounts: [client.payer.address],
      }),
    },
  });

  t.is((await fetchToken(client.umi, sellerAta)).amount, 1000n);
  t.is((await fetchToken(client.umi, buyerAta)).amount, 0n);
});

test('it fails when fee account is not provided', async (t) => {
  const client = await createClient();
  const buyer = await createBuyer(client);
  const asset = await createCoreAsset(client.umi);
  const [tokenMint] = await createMintWithHolders(client.umi, {
    holders: [{ owner: buyer.address, amount: 1000n }],
  });

  const jellybeanMachine = await createGuarded(client, {
    items: [{ asset: asset.publicKey }],
    guards: {
      tokenPayment: { mint: tokenMint.publicKey, amount: 1000n },
    },
  });

  await t.throwsAsync(
    () =>
      drawGuarded(client, buyer, {
        jellybeanMachine,
        mintArgs: {
          tokenPayment: some({ mint: tokenMint.publicKey, feeAccounts: [] }),
        },
      }),
    { message: /MissingRemainingAccount/ }
  );
});

test('it fails when fee account is incorrect', async (t) => {
  const client = await createClient();
  const buyer = await createBuyer(client);
  const asset = await createCoreAsset(client.umi);
  const [tokenMint] = await createMintWithHolders(client.umi, {
    holders: [{ owner: buyer.address, amount: 1000n }],
  });

  const jellybeanMachine = await createGuarded(client, {
    items: [{ asset: asset.publicKey }],
    guards: {
      tokenPayment: { mint: tokenMint.publicKey, amount: 1000n },
    },
  });

  await t.throwsAsync(
    () =>
      drawGuarded(client, buyer, {
        jellybeanMachine,
        mintArgs: {
          tokenPayment: some({
            mint: tokenMint.publicKey,
            feeAccounts: [buyer.address],
          }),
        },
      }),
    { message: /Invalid token account owner/ }
  );
});

test('it transfers to all fee accounts according to their basis points', async (t) => {
  const client = await createClient();
  const buyer = await createBuyer(client);
  const collection = await createMasterEdition(client.umi);
  const feeAccounts = await Promise.all(
    Array.from({ length: 6 }, () => generateKeyPairSigner())
  );
  const amount = 1_000_000_000n;

  const [tokenMint, buyerAta, ...feeAtas] = await createMintWithHolders(
    client.umi,
    {
      holders: [
        { owner: buyer.address, amount },
        ...feeAccounts.map((feeAccount) => ({
          owner: feeAccount.address,
          amount: 0n,
        })),
      ],
    }
  );

  const jellybeanMachine = await createGuarded(client, {
    uri: 'https://example.com',
    feeAccounts: feeAccounts.map((feeAccount, i) => ({
      address: feeAccount.address,
      basisPoints: i === 0 ? 3500 : 1000 + i * 100,
    })),
    items: [{ collection: collection.publicKey }],
    guards: {
      tokenPayment: { mint: tokenMint.publicKey, amount },
    },
  });

  await drawGuarded(client, buyer, {
    jellybeanMachine,
    mintArgs: {
      tokenPayment: some({
        mint: tokenMint.publicKey,
        feeAccounts: feeAccounts.map((feeAccount) => feeAccount.address),
      }),
    },
  });

  const balances = await Promise.all(
    feeAtas.map((feeAta) =>
      fetchToken(client.umi, feeAta).then((x) => x.amount)
    )
  );
  t.deepEqual(balances, [
    350_000_000n,
    110_000_000n,
    120_000_000n,
    130_000_000n,
    140_000_000n,
    150_000_000n,
  ]);
  t.is((await fetchToken(client.umi, buyerAta)).amount, 0n);
});
