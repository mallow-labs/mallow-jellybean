/* eslint-disable no-await-in-loop */
import {
  fetchToken,
  findAssociatedTokenPda,
  setComputeUnitLimit,
  TokenState,
} from '@metaplex-foundation/mpl-toolbox';
import {
  addAmounts,
  generateSigner,
  isEqualToAmount,
  none,
  sol,
  some,
  subtractAmounts,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  addTokens,
  claimNft,
  claimTokens,
  closeGumballMachine,
  draw,
  endSale,
  fetchGumballMachine,
  findGumballGuardPda,
  findGumballMachineAuthorityPda,
  findSellerHistoryPda,
  getMerkleProof,
  getMerkleRoot,
  GumballMachine,
  safeFetchSellerHistory,
  settleTokensSaleClaimed,
  startSale,
  TokenStandard,
} from '../src';
import { create, createMintWithHolders, createNft, createUmi } from './_setup';

test('it cannot settle an unclaimed token sale', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

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
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  const buyer = buyerUmi.identity;
  const payer = await generateSignerWithSol(umi, sol(10));
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        payer,
        buyer,
        mintArgs: {
          solPayment: some(true),
        },
      })
    )
    .sendAndConfirm(umi);

  // Then settle the sale
  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: 0,
        endIndex: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /InvalidBuyer/ });
});

test('it can settle a token sale after claim', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

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
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  const buyer = buyerUmi.identity;
  const payer = await generateSignerWithSol(umi, sol(10));
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        payer,
        buyer,
        mintArgs: {
          solPayment: some(true),
        },
      })
    )
    .sendAndConfirm(umi);

  await claimTokens(buyerUmi, {
    gumballMachine,
    authority: umi.identity.publicKey,
    index: 0,
    seller: umi.identity.publicKey,
    mint: tokenMint.publicKey,
  }).sendAndConfirm(buyerUmi);

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: 0,
        endIndex: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  const payerBalance = await umi.rpc.getBalance(payer.publicKey);
  t.true(isEqualToAmount(payerBalance, sol(9), sol(0.1)));

  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPostBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  t.true(
    isEqualToAmount(
      sellerPostBalance,
      addAmounts(sellerPreBalance, sol(1)),
      sol(0.01)
    )
  );

  t.true(
    isEqualToAmount(
      authorityPdaPostBalance,
      subtractAmounts(authorityPdaPreBalance, sol(1)),
      sol(0.01)
    )
  );

  // And the gumball machine was updated.
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <Partial<GumballMachine>>{
    itemsRedeemed: 1n,
    itemsSettled: 1n,
    items: [
      {
        index: 0,
        isDrawn: true,
        isClaimed: true,
        isSettled: true,
        mint: tokenMint.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 100,
      },
    ],
  });

  // Seller history should be closed
  const sellerHistoryAccount = await safeFetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine,
      seller: umi.identity.publicKey,
    })
  );
  t.falsy(sellerHistoryAccount);
});

test('it can settle a claimed tokens sale as a third party', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

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
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  const buyer = buyerUmi.identity;
  const payer = await generateSignerWithSol(umi, sol(10));
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        payer,
        buyer,
        mintArgs: {
          solPayment: some(true),
        },
      })
    )
    .sendAndConfirm(umi);

  await claimTokens(buyerUmi, {
    gumballMachine,
    authority: umi.identity.publicKey,
    index: 0,
    seller: umi.identity.publicKey,
    mint: tokenMint.publicKey,
  }).sendAndConfirm(buyerUmi);

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  const otherUmi = await createUmi();
  await transactionBuilder()
    .add(setComputeUnitLimit(otherUmi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(otherUmi, {
        startIndex: 0,
        endIndex: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(otherUmi);

  const payerBalance = await umi.rpc.getBalance(payer.publicKey);
  t.true(isEqualToAmount(payerBalance, sol(9), sol(0.1)));

  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPostBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  t.true(
    isEqualToAmount(
      sellerPostBalance,
      addAmounts(sellerPreBalance, sol(1)),
      sol(0.01)
    )
  );

  t.true(
    isEqualToAmount(
      authorityPdaPostBalance,
      subtractAmounts(authorityPdaPreBalance, sol(1)),
      sol(0.01)
    )
  );

  // And the gumball machine was updated.
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <Partial<GumballMachine>>{
    itemsRedeemed: 1n,
    itemsSettled: 1n,
    items: [
      {
        index: 0,
        isDrawn: true,
        isClaimed: true,
        isSettled: true,
        mint: tokenMint.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 100,
      },
    ],
  });

  // Seller history should be closed
  const sellerHistoryAccount = await safeFetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine,
      seller: umi.identity.publicKey,
    })
  );
  t.falsy(sellerHistoryAccount);

  // Buyer should be the owner
  // Then tokens is unfrozen and revoked
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: buyer.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: buyer.publicKey,
    delegate: none(),
    amount: 100n,
  });
});

test('it can settle a tokens item that was not sold', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 1000 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    settings: {
      itemCapacity: 1000,
    },
    items: [
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 1,
        quantity: 1000,
      },
    ],
    startSale: true,
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  await endSale(umi, { gumballMachine }).sendAndConfirm(umi);

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: 0,
        endIndex: 999,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPostBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  t.true(isEqualToAmount(sellerPostBalance, sellerPreBalance, sol(0.01)));
  t.true(isEqualToAmount(authorityPdaPostBalance, authorityPdaPreBalance));

  // And the gumball machine was updated.
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <GumballMachine>{
    itemsRedeemed: 0n,
    itemsSettled: 1000n,
  });

  // Seller history should be closed
  const sellerHistoryAccount = await safeFetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine,
      seller: umi.identity.publicKey,
    })
  );
  t.falsy(sellerHistoryAccount);

  // Seller should own the tokens again
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 1000n,
  });

  // Should now be able to close the machine
  await closeGumballMachine(umi, {
    gumballMachine,
    gumballGuard: findGumballGuardPda(umi, {
      base: gumballMachineSigner.publicKey,
    })[0],
  }).sendAndConfirm(umi);
});

test('it can settle a tokens item that was not sold with proceeds from another sale with fee config', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const [mint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;
  const feeAccount = generateSigner(umi).publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: mint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 50,
        quantity: 2,
      },
    ],
    startSale: true,
    feeConfig: {
      feeAccount,
      feeBps: 500,
    },
    settings: {
      curatorFeeBps: 0,
    },
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  const buyer = buyerUmi.identity;
  const payer = await generateSignerWithSol(umi, sol(10));
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        payer,
        buyer,
        mintArgs: {
          solPayment: some({ feeAccount }),
        },
      })
    )
    .sendAndConfirm(umi);

  let gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);

  const soldIndex = gumballMachineAccount.items.findIndex(
    (i) => i.buyer != null
  );
  await claimTokens(buyerUmi, {
    gumballMachine,
    authority: umi.identity.publicKey,
    index: soldIndex,
    seller: umi.identity.publicKey,
    mint: mint.publicKey,
  }).sendAndConfirm(buyerUmi);

  await endSale(umi, { gumballMachine }).sendAndConfirm(umi);

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale for all tokens
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: 0,
        endIndex: 1,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: mint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  const payerBalance = await umi.rpc.getBalance(payer.publicKey);
  t.true(isEqualToAmount(payerBalance, sol(9), sol(0.1)));

  const authorityPdaPostBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  t.true(
    isEqualToAmount(
      subtractAmounts(authorityPdaPreBalance, authorityPdaPostBalance),
      sol(0.95)
    )
  );

  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const feeAccountBalance = await umi.rpc.getBalance(feeAccount);

  t.true(
    isEqualToAmount(
      sellerPostBalance,
      addAmounts(sellerPreBalance, sol(0.95)),
      sol(0.01)
    )
  );

  t.true(isEqualToAmount(feeAccountBalance, sol(0.05), sol(0.01)));

  // And the gumball machine was updated.
  gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <GumballMachine>{
    itemsRedeemed: 1n,
    itemsSettled: 2n,
    itemsLoaded: 2,
  });

  // Seller history should be closed
  const sellerHistoryAccount = await safeFetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine,
      seller: umi.identity.publicKey,
    })
  );
  t.falsy(sellerHistoryAccount);

  // Seller should be the owner of unsold (half) tokens
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: mint.publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 50n,
  });
});

test('it can settle a claimed tokens item with a marketplace config', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;
  const feeAccount = generateSigner(umi).publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 100,
      },
    ],
    feeConfig: {
      feeAccount,
      feeBps: 500,
    },
    startSale: true,
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  const buyer = buyerUmi.identity;
  const payer = await generateSignerWithSol(umi, sol(10));
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        payer,
        buyer,
        mintArgs: {
          solPayment: some({ feeAccount }),
        },
      })
    )
    .sendAndConfirm(umi);

  await claimTokens(buyerUmi, {
    gumballMachine,
    authority: umi.identity.publicKey,
    index: 0,
    seller: umi.identity.publicKey,
    mint: tokenMint.publicKey,
  }).sendAndConfirm(buyerUmi);

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(buyerUmi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(buyerUmi, {
        startIndex: 0,
        endIndex: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(buyerUmi);

  const payerBalance = await umi.rpc.getBalance(payer.publicKey);
  t.true(isEqualToAmount(payerBalance, sol(9), sol(0.1)));

  const feeAccountBalance = await umi.rpc.getBalance(feeAccount);
  t.true(isEqualToAmount(feeAccountBalance, sol(0.05)));

  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPostBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  t.true(
    isEqualToAmount(
      sellerPostBalance,
      addAmounts(sellerPreBalance, sol(0.95)),
      sol(0.01)
    )
  );

  t.true(isEqualToAmount(authorityPdaPostBalance, sol(0), sol(0.01)));

  // And the gumball machine was updated.
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <Partial<GumballMachine>>{
    itemsRedeemed: 1n,
    itemsSettled: 1n,
    items: [
      {
        index: 0,
        isDrawn: true,
        isClaimed: true,
        isSettled: true,
        mint: tokenMint.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 100,
      },
    ],
  });

  // Seller history should be closed
  const sellerHistoryAccount = await safeFetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine,
      seller: umi.identity.publicKey,
    })
  );
  t.falsy(sellerHistoryAccount);

  // Buyer should be the owner
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

test('it cannot settle an nft sale', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const nft = await createNft(umi);

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

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
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  const buyer = buyerUmi.identity;
  const payer = await generateSignerWithSol(umi, sol(10));
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        payer,
        buyer,
        mintArgs: {
          solPayment: some(true),
        },
      })
    )
    .sendAndConfirm(umi);

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      claimNft(buyerUmi, {
        gumballMachine,
        index: 0,
        payer,
        buyer: buyerUmi.identity.publicKey,
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
      })
    )
    .sendAndConfirm(buyerUmi);

  // Then settle the sale
  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: 0,
        endIndex: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /InvalidTokenStandard/ });
});

test('it cannot settle an already settled tokens item', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 1,
        quantity: 100,
      },
    ],
    startSale: true,
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  const buyer = buyerUmi.identity;
  const payer = await generateSignerWithSol(umi, sol(10));
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        payer,
        buyer,
        mintArgs: {
          solPayment: some(true),
        },
      })
    )
    .sendAndConfirm(umi);

  await endSale(umi, { gumballMachine }).sendAndConfirm(umi);

  // Get the index drawn
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  const indexDrawn = gumballMachineAccount.items.findIndex(
    (item) => item.buyer != null
  );

  await claimTokens(buyerUmi, {
    gumballMachine,
    authority: umi.identity.publicKey,
    index: indexDrawn,
    seller: umi.identity.publicKey,
    mint: tokenMint.publicKey,
  }).sendAndConfirm(buyerUmi);

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: indexDrawn,
        endIndex: indexDrawn,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: indexDrawn,
        endIndex: indexDrawn,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /ItemAlreadySettled/ });
});

test('it can reclaim varying token amounts', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 75,
      },
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 25,
      },
    ],
    startSale: true,
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  await endSale(umi, { gumballMachine }).sendAndConfirm(umi);

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: 0,
        endIndex: 1,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  const sellerTokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );
  t.like(sellerTokenAccount, {
    state: TokenState.Initialized,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 100n,
  });
});

test('it cannot settle when startIndex > endIndex', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 50,
      },
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 50,
      },
    ],
    startSale: true,
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  await endSale(umi, { gumballMachine }).sendAndConfirm(umi);

  // When we try to settle with invalid indices
  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: 1,
        endIndex: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Then we expect an error
  await t.throwsAsync(promise, { message: /InvalidInputLength/ });
});

test('it can settle with curator fees', async (t) => {
  // Given a gumball machine with curator fees
  const umi = await createUmi();
  const otherSellerUmi = await createUmi();
  const sellersMerkleRoot = getMerkleRoot([otherSellerUmi.identity.publicKey]);

  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: otherSellerUmi.identity, amount: 100 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;
  const curatorFeeBps = 1000; // 10%

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    settings: {
      curatorFeeBps,
      sellersMerkleRoot,
    },
    feeConfig: none(),
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  // When we add tokens to the Gumball Machine.
  await transactionBuilder()
    .add(
      addTokens(otherSellerUmi, {
        gumballMachine: gumballMachineSigner.publicKey,
        mint: tokenMint.publicKey,
        amount: 100,
        quantity: 1,
        args: {
          sellerProofPath: getMerkleProof(
            [otherSellerUmi.identity.publicKey],
            otherSellerUmi.identity.publicKey
          ),
        },
      })
    )
    .sendAndConfirm(otherSellerUmi);

  // Start the sale
  await startSale(umi, { gumballMachine }).sendAndConfirm(umi);

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  const buyer = buyerUmi.identity;
  const payer = await generateSignerWithSol(umi, sol(10));
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        payer,
        buyer,
        mintArgs: {
          solPayment: some(true),
        },
      })
    )
    .sendAndConfirm(umi);

  await claimTokens(buyerUmi, {
    gumballMachine,
    authority: umi.identity.publicKey,
    index: 0,
    seller: otherSellerUmi.identity.publicKey,
    mint: tokenMint.publicKey,
  }).sendAndConfirm(buyerUmi);

  const sellerPreBalance = await umi.rpc.getBalance(
    otherSellerUmi.identity.publicKey
  );
  const authorityPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: 0,
        endIndex: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: otherSellerUmi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  const sellerPostBalance = await umi.rpc.getBalance(
    otherSellerUmi.identity.publicKey
  );
  const authorityPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);

  // Verify the curator fee was applied correctly
  // Seller should get 90% (0.9 SOL) and curator should get 10% (0.1 SOL)
  t.true(
    isEqualToAmount(
      sellerPostBalance,
      addAmounts(sellerPreBalance, sol(0.9)),
      sol(0.01)
    )
  );

  t.true(
    isEqualToAmount(
      authorityPostBalance,
      addAmounts(authorityPreBalance, sol(0.1)),
      sol(0.01)
    )
  );
});

test('it cannot settle index out of bounds', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

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
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  await endSale(umi, { gumballMachine }).sendAndConfirm(umi);

  // When we try to settle with an index out of bounds
  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: 0,
        endIndex: 10, // Out of bounds index
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Then we expect an error
  await t.throwsAsync(promise, { message: /IndexGreaterThanLength/ });
});

test('it can settle multiple items drawn and claimed', async (t) => {
  // Given a gumball machine with multiple items
  const umi = await createUmi();
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 200 }],
  });

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 50,
      },
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 50,
      },
    ],
    startSale: true,
    guards: {
      botTax: { lamports: sol(0.01), lastInstruction: true },
      solPayment: { lamports: sol(1) },
    },
  });

  // Draw and claim two items
  const buyerUmi = await createUmi();
  const buyer = buyerUmi.identity;
  const payer = await generateSignerWithSol(umi, sol(10));

  // Draw first item
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        payer,
        buyer,
        mintArgs: {
          solPayment: some(true),
        },
      })
    )
    .sendAndConfirm(umi);

  // Draw second item
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        payer,
        buyer,
        mintArgs: {
          solPayment: some(true),
        },
      })
    )
    .sendAndConfirm(umi);

  // Claim both items
  await claimTokens(buyerUmi, {
    gumballMachine,
    authority: umi.identity.publicKey,
    index: 0,
    seller: umi.identity.publicKey,
    mint: tokenMint.publicKey,
  }).sendAndConfirm(buyerUmi);

  await claimTokens(buyerUmi, {
    gumballMachine,
    authority: umi.identity.publicKey,
    index: 1,
    seller: umi.identity.publicKey,
    mint: tokenMint.publicKey,
  }).sendAndConfirm(buyerUmi);

  // Then settle both sales at once
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSaleClaimed(umi, {
        startIndex: 0,
        endIndex: 1,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Verify the gumball machine state
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <Partial<GumballMachine>>{
    itemsRedeemed: 2n,
    itemsSettled: 2n,
    items: [
      {
        index: 0,
        isDrawn: true,
        isClaimed: true,
        isSettled: true,
      },
      {
        index: 1,
        isDrawn: true,
        isClaimed: true,
        isSettled: true,
      },
    ],
  });

  // Verify buyer token account
  const buyerTokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: buyer.publicKey,
    })[0]
  );

  t.like(buyerTokenAccount, {
    state: TokenState.Initialized,
    owner: buyer.publicKey,
    delegate: none(),
    amount: 100n, // 50 + 50
  });
});
