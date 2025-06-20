/* eslint-disable no-await-in-loop */
import {
  fetchToken,
  findAssociatedTokenPda,
  setComputeUnitLimit,
  TokenState,
} from '@metaplex-foundation/mpl-toolbox';
import {
  generateSigner,
  none,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import test from 'ava';
import {
  claimTokens,
  draw,
  fetchGumballMachine,
  findGumballMachineAuthorityPda,
  GumballMachine,
  TokenStandard,
} from '../src';
import {
  assertItemBought as assertItemDrawn,
  create,
  createMintWithHolders,
  createUmi,
} from './_setup';

test('it can claim a tokens item', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const gumballMachineSigner = generateSigner(umi);

  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [
      { owner: umi.identity, amount: 100 },
      {
        owner: findGumballMachineAuthorityPda(umi, {
          gumballMachine: gumballMachineSigner.publicKey,
        }),
        amount: 0,
      },
    ],
  });

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 100,
      },
    ],
    startSale: true,
    guards: {},
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(buyerUmi, {
        gumballMachine,
      })
    )
    .sendAndConfirm(buyerUmi);

  // Then the mint was successful.
  await assertItemDrawn(t, umi, {
    gumballMachine,
    buyer: buyerUmi.identity.publicKey,
  });

  await transactionBuilder()
    .add(
      claimTokens(buyerUmi, {
        gumballMachine,
        authority: umi.identity.publicKey,
        index: 0,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(buyerUmi);

  // And the gumball machine was updated.
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <Partial<GumballMachine>>{
    itemsRedeemed: 1n,
    itemsSettled: 0n,
    items: [
      {
        index: 0,
        isDrawn: true,
        isClaimed: true,
        isSettled: false,
        mint: tokenMint.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 100,
      },
    ],
  });

  // Buyer should be the owner of the tokens
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: buyerUmi.identity.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: buyerUmi.identity.publicKey,
    delegate: none(),
    amount: 100n,
  });
});

test('it cannot claim a tokens item as another buyer', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const gumballMachineSigner = generateSigner(umi);

  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [
      { owner: umi.identity, amount: 100 },
      {
        owner: findGumballMachineAuthorityPda(umi, {
          gumballMachine: gumballMachineSigner.publicKey,
        }),
        amount: 0,
      },
    ],
  });

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 100,
      },
    ],
    startSale: true,
    guards: {},
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(buyerUmi, {
        gumballMachine,
      })
    )
    .sendAndConfirm(buyerUmi);

  // Then attempt to claim with a different user
  const promise = transactionBuilder()
    .add(
      claimTokens(umi, {
        gumballMachine,
        authority: umi.identity.publicKey,
        index: 0,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /InvalidBuyer/ });
});
