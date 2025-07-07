import { drawJellybean } from '@mallow-labs/mallow-gumball';
import { sol, some } from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import { fetchJellybeanMachine } from '../../src';
import {
  create,
  createCoreAsset,
  createUmi,
  tomorrow,
  yesterday,
} from '../_setup';

test('it allows minting after the start date', async (t) => {
  // Given a gumball machine with a start date in the past.
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    guards: {
      solPayment: some({ lamports: sol(0.1) }),
      startDate: some({ date: yesterday() }),
    },
  });

  // When we mint from it.

  // When we mint for another owner using an explicit payer.
  const buyer = await generateSignerWithSol(umi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [umi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  // Then the mint was successful.
  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.supplyRedeemed, 1n);
});

test('it forbids minting before the start date', async (t) => {
  // Given a gumball machine with a start date in the past.
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    guards: {
      solPayment: some({ lamports: sol(0.1) }),
      startDate: some({ date: tomorrow() }),
    },
  });

  // When we mint from it.

  // When we mint for another owner using an explicit payer.
  const buyer = await generateSignerWithSol(umi);
  const buyerUmi = await createUmi(buyer);

  await t.throwsAsync(
    drawJellybean(buyerUmi, {
      jellybeanMachine,
      mintArgs: {
        solPayment: some({
          feeAccounts: [umi.identity.publicKey],
        }),
      },
    }).sendAndConfirm(buyerUmi),
    {
      message: /MintNotLive/,
    }
  );
});
