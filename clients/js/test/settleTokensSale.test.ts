/* eslint-disable no-await-in-loop */
import {
  fetchToken,
  findAssociatedTokenPda,
  setComputeUnitLimit,
  TokenState,
} from '@metaplex-foundation/mpl-toolbox';
import {
  addAmounts,
  defaultPublicKey,
  generateSigner,
  isEqualToAmount,
  none,
  publicKey,
  sol,
  some,
  subtractAmounts,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  claimTokens,
  draw,
  endSale,
  fetchGumballMachine,
  findGumballMachineAuthorityPda,
  findSellerHistoryPda,
  GumballMachine,
  safeFetchSellerHistory,
  settleTokensSale,
  TokenStandard,
} from '../src';
import { create, createMintWithHolders, createUmi } from './_setup';

test('it can settle a token sale', async (t) => {
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

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
        receiverTokenAccount: findAssociatedTokenPda(umi, {
          mint: tokenMint.publicKey,
          owner: buyerUmi.identity.publicKey,
        })[0],
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

  // Buyer should be the owner of the tokens
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

  // Authority pda token account should be closed
  const authorityPdaTokenAccountExists = await umi.rpc.accountExists(
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: findGumballMachineAuthorityPda(umi, {
        gumballMachine: gumballMachine,
      })[0],
    })[0]
  );
  t.falsy(authorityPdaTokenAccountExists);
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
      settleTokensSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
        receiverTokenAccount: findAssociatedTokenPda(umi, {
          mint: tokenMint.publicKey,
          owner: buyerUmi.identity.publicKey,
        })[0],
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

test('it can settle a tokens sale as a third party', async (t) => {
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

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  const otherUmi = await createUmi();
  await transactionBuilder()
    .add(setComputeUnitLimit(otherUmi, { units: 600_000 }))
    .add(
      settleTokensSale(otherUmi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
        receiverTokenAccount: findAssociatedTokenPda(otherUmi, {
          mint: tokenMint.publicKey,
          owner: buyerUmi.identity.publicKey,
        })[0],
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

test('it can settle a tokens that was not sold', async (t) => {
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

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        buyer: defaultPublicKey(),
        mint: tokenMint.publicKey,
        receiverTokenAccount: findAssociatedTokenPda(umi, {
          mint: tokenMint.publicKey,
          owner: umi.identity.publicKey,
        })[0],
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
    itemsSettled: 1n,
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
    amount: 100n,
  });
});

test('it can settle a tokens sale that was not sold with proceeds from another sale with fee config', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const items = await Promise.all([
    createMintWithHolders(umi, {
      holders: [{ owner: umi.identity, amount: 100 }],
    }),
    createMintWithHolders(umi, {
      holders: [{ owner: umi.identity, amount: 100 }],
    }),
  ]);

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;
  const feeAccount = generateSigner(umi).publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: items[0][0].publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 100,
      },
      {
        id: items[1][0].publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 100,
      },
    ],
    startSale: true,
    feeConfig: {
      feeAccount,
      feeBps: 500,
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

  await endSale(umi, { gumballMachine }).sendAndConfirm(umi);

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  let gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  const unsoldItem = gumballMachineAccount.items.find((i) => i.buyer == null)!;

  // Then settle the sale for the unsold tokens
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSale(umi, {
        index: unsoldItem.index,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: publicKey(unsoldItem.seller),
        buyer: defaultPublicKey(),
        mint: publicKey(unsoldItem.mint),
        receiverTokenAccount: findAssociatedTokenPda(umi, {
          mint: publicKey(unsoldItem.mint),
          owner: umi.identity.publicKey,
        })[0],
        feeAccount,
      })
    )
    .sendAndConfirm(umi);

  const payerBalance = await umi.rpc.getBalance(payer.publicKey);
  t.true(isEqualToAmount(payerBalance, sol(9), sol(0.1)));

  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPostBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );
  const feeAccountBalance = await umi.rpc.getBalance(feeAccount);

  t.true(
    isEqualToAmount(
      sellerPostBalance,
      addAmounts(sellerPreBalance, sol(0.475)),
      sol(0.01)
    )
  );

  t.true(
    isEqualToAmount(
      authorityPdaPostBalance,
      subtractAmounts(authorityPdaPreBalance, sol(0.475)),
      sol(0.01)
    )
  );

  t.true(isEqualToAmount(feeAccountBalance, sol(0.05), sol(0.01)));

  // And the gumball machine was updated.
  gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <GumballMachine>{
    itemsRedeemed: 1n,
    itemsSettled: 1n,
    itemsLoaded: 2,
  });

  // Seller history should not be closed
  const sellerHistoryAccount = await safeFetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine,
      seller: umi.identity.publicKey,
    })
  );
  t.truthy(sellerHistoryAccount);

  // Seller should be the owner of the tokens
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: publicKey(unsoldItem.mint),
      owner: umi.identity.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 100n,
  });
});

test('it cannot settle a tokens sale to the wrong buyer', async (t) => {
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

  // Then settle the sale for the unsold tokens
  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleTokensSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        buyer: umi.identity.publicKey,
        mint: tokenMint.publicKey,
        receiverTokenAccount: findAssociatedTokenPda(umi, {
          mint: tokenMint.publicKey,
          owner: umi.identity.publicKey,
        })[0],
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /InvalidBuyer/ });
});

test('it can settle a tokens sale with a marketplace config', async (t) => {
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

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(buyerUmi, { units: 600_000 }))
    .add(
      settleTokensSale(buyerUmi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: tokenMint.publicKey,
        receiverTokenAccount: findAssociatedTokenPda(buyerUmi, {
          mint: tokenMint.publicKey,
          owner: buyerUmi.identity.publicKey,
        })[0],
        feeAccount,
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
