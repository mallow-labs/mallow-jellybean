import {
  fetchToken,
  findAssociatedTokenPda,
  setComputeUnitLimit,
} from '@metaplex-foundation/mpl-toolbox';
import {
  generateSigner,
  publicKey,
  sol,
  some,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import test from 'ava';
import {
  closeGumballMachine,
  deleteGumballMachine,
  draw,
  findGumballGuardPda,
  findGumballMachineAuthorityPda,
  getDefaultBuyBackConfig,
  manageBuyBackFunds,
  settleNftSale,
  TokenStandard,
} from '../src';
import {
  assertItemBought,
  create,
  createMintWithHolders,
  createNft,
  createUmi,
} from './_setup';

test('it can delete an empty gumball machine', async (t) => {
  // Given an existing gumball machine.
  const umi = await createUmi();
  const gumballMachine = await create(umi);

  // When we delete it.
  await transactionBuilder()
    .add(
      deleteGumballMachine(umi, { gumballMachine: gumballMachine.publicKey })
    )
    .sendAndConfirm(umi);

  // Then the gumball machine account no longer exists.
  t.false(await umi.rpc.accountExists(gumballMachine.publicKey));
});

test('it can delete an empty gumball machine with guard', async (t) => {
  // Given an existing gumball machine.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { guards: {} });
  const gumballGuard = findGumballGuardPda(umi, {
    base: gumballMachine.publicKey,
  })[0];

  // When we delete it.
  await transactionBuilder()
    .add(
      closeGumballMachine(umi, {
        gumballGuard,
        gumballMachine: gumballMachine.publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Then the gumball machine account no longer exists.
  t.false(await umi.rpc.accountExists(gumballMachine.publicKey));
  // Then the gumball guard account no longer exists.
  t.false(await umi.rpc.accountExists(gumballGuard));
});

test('it can delete a settled gumball machine with native token', async (t) => {
  // Given an existing gumball machine.
  const umi = await createUmi();
  const buyerUmi = await createUmi();
  const buyer = buyerUmi.identity;
  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  const nft = await createNft(umi);

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
    ],
    startSale: true,
    guards: {
      solPayment: {
        lamports: sol(1),
      },
    },
  });

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(buyerUmi, {
        gumballMachine,
        mintArgs: {
          solPayment: some(true),
        },
      })
    )
    .sendAndConfirm(buyerUmi);

  // Then minting was successful.
  await assertItemBought(t, umi, { gumballMachine, buyer: publicKey(buyer) });

  const payer = await generateSignerWithSol(umi, sol(10));
  await settleNftSale(umi, {
    payer,
    index: 0,
    gumballMachine,
    buyer: buyer.publicKey,
    seller: umi.identity.publicKey,
    mint: nft.publicKey,
    creators: [umi.identity.publicKey],
  })
    .prepend(setComputeUnitLimit(umi, { units: 600_000 }))
    .sendAndConfirm(umi);

  const gumballGuard = findGumballGuardPda(umi, { base: gumballMachine })[0];
  // When we delete it.
  await transactionBuilder()
    .add(closeGumballMachine(umi, { gumballMachine, gumballGuard }))
    .sendAndConfirm(umi);

  // Then the gumball machine account no longer exists.
  t.false(await umi.rpc.accountExists(gumballMachine));
});

test('it can delete a settled gumball machine with payment token', async (t) => {
  // Given an existing gumball machine.
  const umi = await createUmi();
  const buyerUmi = await createUmi();
  const buyer = buyerUmi.identity;
  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;
  const authorityPda = findGumballMachineAuthorityPda(umi, {
    gumballMachine: gumballMachine,
  })[0];
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [
      { owner: buyer, amount: 12 },
      { owner: authorityPda, amount: 0 },
    ],
  });
  const authorityPdaPaymentAccount = findAssociatedTokenPda(umi, {
    mint: tokenMint.publicKey,
    owner: authorityPda,
  })[0];

  const nft = await createNft(umi);

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    settings: {
      paymentMint: tokenMint.publicKey,
    },
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
    ],
    startSale: true,
    guards: {
      tokenPayment: { amount: 1, mint: tokenMint.publicKey },
    },
  });

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(buyerUmi, {
        gumballMachine,
        mintArgs: {
          tokenPayment: some({ mint: tokenMint.publicKey }),
        },
      })
    )
    .sendAndConfirm(buyerUmi);

  // Then minting was successful.
  await assertItemBought(t, umi, { gumballMachine, buyer: publicKey(buyer) });

  // Then the payment token account account no longer exists.
  t.true(await umi.rpc.accountExists(authorityPdaPaymentAccount));

  const payer = await generateSignerWithSol(umi, sol(10));
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        payer,
        index: 0,
        gumballMachine,
        buyer: buyer.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        paymentMint: tokenMint.publicKey,
        creators: [umi.identity.publicKey],
      })
    )
    .sendAndConfirm(umi);

  const gumballGuard = findGumballGuardPda(umi, { base: gumballMachine })[0];
  // When we delete it.
  await transactionBuilder()
    .add(
      closeGumballMachine(umi, {
        gumballGuard,
        gumballMachine,
        authorityPdaPaymentAccount,
        paymentMint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Then the gumball machine account no longer exists.
  t.false(await umi.rpc.accountExists(gumballMachine));

  // Then the payment token account account no longer exists.
  t.false(await umi.rpc.accountExists(authorityPdaPaymentAccount));

  // Seller should have the one token left
  const sellerTokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );
  t.is(sellerTokenAccount.amount, 1n);
});

test('it cannot delete a gumball machine that has not been fully settled', async (t) => {
  // Given an existing gumball machine.
  const umi = await createUmi();
  const gumballMachine = await create(umi, {
    items: [
      {
        id: (await createNft(umi)).publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
    ],
  });

  // When we delete it.
  const promise = transactionBuilder()
    .add(
      deleteGumballMachine(umi, { gumballMachine: gumballMachine.publicKey })
    )
    .sendAndConfirm(umi);

  // Then the transaction fails.
  await t.throwsAsync(promise, { message: /NotAllSettled/ });
});

test('it cannot delete a gumball machine that has buy back funds remaining', async (t) => {
  // Given an existing gumball machine with buyback enabled
  const umi = await createUmi();

  const gumballMachine = await create(umi, {
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      enabled: true,
    },
  });

  // Add buy back funds
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: 1 * LAMPORTS_PER_SOL, // 1 SOL
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

  // When we try to delete it
  const promise = transactionBuilder()
    .add(
      deleteGumballMachine(umi, { gumballMachine: gumballMachine.publicKey })
    )
    .sendAndConfirm(umi);

  // Then the transaction fails due to funds not being withdrawn
  await t.throwsAsync(promise, { message: /BuyBackFundsNotZero/ });
});

test('it can delete a gumball machine that has no buy back funds remaining', async (t) => {
  // Given an existing gumball machine with buyback enabled
  const umi = await createUmi();

  const gumballMachine = await create(umi, {
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      enabled: true,
    },
  });

  // Add buy back funds
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: 1,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

  // Withdraw all buy back funds
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: 1,
        isWithdraw: true,
      })
    )
    .sendAndConfirm(umi);

  // When we delete it
  await transactionBuilder()
    .add(
      deleteGumballMachine(umi, { gumballMachine: gumballMachine.publicKey })
    )
    .sendAndConfirm(umi);

  // Then the gumball machine account no longer exists
  t.false(await umi.rpc.accountExists(gumballMachine.publicKey));
});
