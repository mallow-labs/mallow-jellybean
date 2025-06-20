/* eslint-disable no-await-in-loop */
import { AssetV1, fetchAssetV1 } from '@metaplex-foundation/mpl-core';
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
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import test from 'ava';
import {
  addNft,
  closeGumballMachine,
  draw,
  fetchGumballMachine,
  findGumballGuardPda,
  findGumballMachineAuthorityPda,
  getDefaultBuyBackConfig,
  GumballMachine,
  manageBuyBackFunds,
  sellItem,
  settleNftSale,
  settleTokensSaleClaimed,
  TokenStandard,
} from '../src';
import {
  create,
  createCoreAsset,
  createMintWithHolders,
  createNft,
  createProgrammableNft,
  createUmi,
} from './_setup';

test('it can sell an nft item', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const nft = await createNft(umi);
  // Oracle signer (authorized to sell on behalf of sellers)
  const oracleSigner = generateSigner(umi);

  // Create gumball machine with buyback enabled
  const gumballMachineSigner = await create(umi, {
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
    ],
    startSale: true,
    guards: {},
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
      cutoffPct: 0,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  const depositAmount = LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

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

  const preBuyerTokenAccount = await umi.rpc.getBalance(
    buyerUmi.identity.publicKey
  );

  // Buyer can sell back to the seller
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 1,
        buyPrice: LAMPORTS_PER_SOL,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  const postBuyerTokenAccount = await umi.rpc.getBalance(
    buyerUmi.identity.publicKey
  );

  t.true(
    isEqualToAmount(
      postBuyerTokenAccount,
      addAmounts(preBuyerTokenAccount, sol(1)),
      sol(0.001)
    )
  );

  // And the gumball machine was updated.
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <Partial<GumballMachine>>{
    items: [
      {
        index: 0,
        isDrawn: true,
        isClaimed: true,
        isSettled: false,
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
    ],
  });

  // Check that the NFT is now owned by the authority
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 1n,
  });
});

test('it can sell a pnft item', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const nft = await createProgrammableNft(umi);
  const oracleSigner = generateSigner(umi);

  // Create gumball machine with buyback enabled
  const gumballMachineSigner = await create(umi, {
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
      },
    ],
    startSale: true,
    guards: {},
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  const depositAmount = LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

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

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 1,
        buyPrice: LAMPORTS_PER_SOL,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: nft.publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  // And the gumball machine was updated.
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <Partial<GumballMachine>>{
    items: [
      {
        index: 0,
        isDrawn: true,
        isClaimed: true,
        isSettled: false,
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
        amount: 1,
      },
    ],
  });

  // Buyer should be the owner
  // Then nft is unfrozen and revoked
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Frozen,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 1n,
  });

  // Should be able to add the asset to a new Gumball
  await create(umi, {
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
      },
    ],
    startSale: true,
    guards: {},
  });
});

test('it can sell a tokens item', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const gumballMachineSigner = generateSigner(umi);
  const oracleSigner = generateSigner(umi);

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

  // Create gumball machine with buyback enabled
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
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  const depositAmount = LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

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

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 100,
        buyPrice: LAMPORTS_PER_SOL,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  // And the gumball machine was updated.
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <Partial<GumballMachine>>{
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
      owner: umi.identity.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 100n,
  });

  // Should be able to add the tokens to a new Gumball
  await create(umi, {
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
});

test('it can sell a core asset item', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const asset = await createCoreAsset(umi);
  const oracleSigner = generateSigner(umi);

  // Create gumball machine with buyback enabled
  const gumballMachineSigner = await create(umi, {
    items: [
      {
        id: asset.publicKey,
        tokenStandard: TokenStandard.Core,
      },
    ],
    startSale: true,
    guards: {},
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  const depositAmount = LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

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

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 1,
        buyPrice: LAMPORTS_PER_SOL,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: asset.publicKey,
        tokenStandard: TokenStandard.Core,
      })
    )
    .sendAndConfirm(buyerUmi);

  // And the gumball machine was updated.
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <Partial<GumballMachine>>{
    items: [
      {
        index: 0,
        isDrawn: true,
        isClaimed: true,
        isSettled: false,
        mint: asset.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.Core,
        amount: 1,
      },
    ],
  });

  // Check that the core asset is now owned by the authority
  const coreAsset = await fetchAssetV1(umi, asset.publicKey);
  t.like(coreAsset, <AssetV1>{
    owner: umi.identity.publicKey,
    freezeDelegate: {
      frozen: false,
      authority: {
        type: 'Owner',
      },
    },
    transferDelegate: {
      authority: {
        type: 'Owner',
      },
    },
  });

  // Should be able to add the asset to a new Gumball
  await create(umi, {
    items: [
      {
        id: asset.publicKey,
        tokenStandard: TokenStandard.Core,
      },
    ],
    startSale: true,
    guards: {},
  });
});

test('it can sell an item when cutoff pct has not been reached', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const gumballMachineSigner = generateSigner(umi);
  const oracleSigner = generateSigner(umi);

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

  // Create gumball machine with buyback enabled
  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 30,
        quantity: 3,
      },
    ],
    startSale: true,
    guards: {},
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
      cutoffPct: 50,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  const depositAmount = LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

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

  const drawnIndex = await fetchGumballMachine(umi, gumballMachine).then(
    (gumballMachine) => gumballMachine.items.findIndex((item) => item.isDrawn)
  );

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: drawnIndex,
        amount: 30,
        buyPrice: LAMPORTS_PER_SOL,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  t.pass();
});

test('it can sell using spl token buy back funds', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const nft = await createNft(umi);
  // Oracle signer (authorized to sell on behalf of sellers)
  const oracleSigner = generateSigner(umi);

  const buyerUmi = await createUmi();
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [
      { owner: umi.identity, amount: 100 },
      { owner: buyerUmi.identity, amount: 50 },
    ],
  });

  const sellerBalance = await umi.rpc.getBalance(umi.identity.publicKey);

  // Create gumball machine with buyback enabled
  const gumballMachineSigner = await create(umi, {
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
    ],
    startSale: true,
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
      cutoffPct: 0,
    },
    settings: {
      paymentMint: tokenMint.publicKey,
    },
    guards: {
      tokenPayment: {
        mint: tokenMint.publicKey,
        amount: 50,
      },
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: 100,
        paymentMint: tokenMint.publicKey,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

  // When we mint from the gumball guard.
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(buyerUmi, {
        gumballMachine,
        mintArgs: {
          tokenPayment: {
            mint: tokenMint.publicKey,
          },
        },
      })
    )
    .sendAndConfirm(buyerUmi);

  // Buyer can sell back to the seller
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 1,
        buyPrice: 40,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: nft.publicKey,
        paymentMint: tokenMint.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  const postBuyerTokenAccount = await fetchToken(
    buyerUmi,
    findAssociatedTokenPda(buyerUmi, {
      mint: tokenMint.publicKey,
      owner: buyerUmi.identity.publicKey,
    })[0]
  );
  t.is(postBuyerTokenAccount.amount, 40n);

  // Withdraw buy back funds
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: 60,
        paymentMint: tokenMint.publicKey,
        isWithdraw: true,
      })
    )
    .sendAndConfirm(umi);

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        gumballMachine,
        index: 0,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        paymentMint: tokenMint.publicKey,
        creators: [umi.identity.publicKey],
      })
    )
    .sendAndConfirm(umi);

  const gumballGuard = findGumballGuardPda(umi, {
    base: gumballMachineSigner.publicKey,
  })[0];

  const authorityPdaPaymentAccount = findAssociatedTokenPda(umi, {
    mint: tokenMint.publicKey,
    owner: findGumballMachineAuthorityPda(umi, {
      gumballMachine: gumballMachineSigner.publicKey,
    })[0],
  })[0];

  // When we delete it.
  await transactionBuilder()
    .add(
      closeGumballMachine(umi, {
        gumballGuard,
        gumballMachine: gumballMachineSigner.publicKey,
        paymentMint: tokenMint.publicKey,
        authorityPdaPaymentAccount,
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
  // 60 from buyback funds, 50 from sale of item
  t.is(sellerTokenAccount.amount, 110n);

  // Should have all rent returned from token accounts
  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  t.true(isEqualToAmount(sellerBalance, sellerPostBalance, sol(0.001)));
});

test('it can settle and close a gumball after selling a token item back', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const gumballMachineSigner = generateSigner(umi);
  const oracleSigner = generateSigner(umi);

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

  const sellerBalance = await umi.rpc.getBalance(umi.identity.publicKey);

  // Create gumball machine with buyback enabled
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
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  const depositAmount = LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

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

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 100,
        buyPrice: depositAmount,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
      })
    )
    .sendAndConfirm(buyerUmi);

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

  const gumballGuard = findGumballGuardPda(umi, {
    base: gumballMachineSigner.publicKey,
  })[0];

  // When we delete it.
  await transactionBuilder()
    .add(
      closeGumballMachine(umi, {
        gumballGuard,
        gumballMachine: gumballMachineSigner.publicKey,
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
  // 100 from the item bought back
  t.is(sellerTokenAccount.amount, 100n);

  // Should have all rent returned from token accounts
  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  t.true(
    isEqualToAmount(
      sellerBalance,
      addAmounts(sellerPostBalance, sol(1)),
      sol(0.002)
    )
  );
});

test('it can sell an item with a marketplace fee', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const feeAccount = generateSigner(umi);
  const nft = await createNft(umi);
  // Oracle signer (authorized to sell on behalf of sellers)
  const oracleSigner = generateSigner(umi);

  // Create gumball machine with buyback enabled
  const gumballMachineSigner = await create(umi, {
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
    ],
    startSale: true,
    guards: {},
    feeConfig: {
      feeAccount: feeAccount.publicKey,
      feeBps: 0,
    },
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
      cutoffPct: 0,
      marketplaceFeeBps: 1000,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  const depositAmount = LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: depositAmount * 1.1,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

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

  const preBuyerBalance = await umi.rpc.getBalance(buyerUmi.identity.publicKey);
  const preFeeBalance = await umi.rpc.getBalance(feeAccount.publicKey);

  // Buyer can sell back to the seller
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 1,
        buyPrice: depositAmount,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: nft.publicKey,
        feeAccount: feeAccount.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  const postBuyerBalance = await umi.rpc.getBalance(
    buyerUmi.identity.publicKey
  );
  const postFeeBalance = await umi.rpc.getBalance(feeAccount.publicKey);

  t.true(
    isEqualToAmount(
      postBuyerBalance,
      addAmounts(preBuyerBalance, sol(1)),
      sol(0.001)
    )
  );

  t.true(isEqualToAmount(postFeeBalance, addAmounts(preFeeBalance, sol(0.1))));

  // And the gumball machine was updated.
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <Partial<GumballMachine>>{
    items: [
      {
        index: 0,
        isDrawn: true,
        isClaimed: true,
        isSettled: false,
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
    ],
    // Should be 0 because of the 10% marketplace fee for buy back
    buyBackFundsAvailable: 0n,
  });
});

test('it can sell an item with a marketplace fee using a payment mint', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const feeAccount = generateSigner(umi);
  const nft = await createNft(umi);
  // Oracle signer (authorized to sell on behalf of sellers)
  const oracleSigner = generateSigner(umi);
  const buyerUmi = await createUmi();

  const [paymentMint, buyerTokenAccount, feeTokenAccount] =
    await createMintWithHolders(umi, {
      holders: [
        { owner: buyerUmi.identity.publicKey, amount: 100 },
        { owner: feeAccount.publicKey, amount: 0 },
        { owner: umi.identity, amount: 110 },
      ],
    });

  // Create gumball machine with buyback enabled
  const gumballMachineSigner = await create(umi, {
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
    ],
    startSale: true,
    guards: {
      tokenPayment: {
        mint: paymentMint.publicKey,
        amount: 100,
      },
    },
    feeConfig: {
      feeAccount: feeAccount.publicKey,
      feeBps: 0,
    },
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
      cutoffPct: 0,
      marketplaceFeeBps: 1000,
    },
    settings: {
      paymentMint: paymentMint.publicKey,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: 110,
        isWithdraw: false,
        paymentMint: paymentMint.publicKey,
      })
    )
    .sendAndConfirm(umi);

  // When we mint from the gumball guard.
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(buyerUmi, {
        gumballMachine,
        mintArgs: {
          tokenPayment: {
            mint: paymentMint.publicKey,
            feeAccount: feeAccount.publicKey,
          },
        },
      })
    )
    .sendAndConfirm(buyerUmi);

  // Buyer can sell back to the seller
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 1,
        buyPrice: 100,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: nft.publicKey,
        feeAccount: feeAccount.publicKey,
        paymentMint: paymentMint.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  const buyerBalance = await fetchToken(umi, buyerTokenAccount);
  t.is(buyerBalance.amount, 100n);

  const feeBalance = await fetchToken(umi, feeTokenAccount);
  t.is(feeBalance.amount, 10n);

  // And the gumball machine was updated.
  const gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  t.like(gumballMachineAccount, <Partial<GumballMachine>>{
    items: [
      {
        index: 0,
        isDrawn: true,
        isClaimed: true,
        isSettled: false,
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
    ],
    // Should be 0 because of the 10% marketplace fee for buy back
    buyBackFundsAvailable: 0n,
  });
});

test('it cannot sell an item with invalid oracle signer', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const nft = await createNft(umi);

  // Create gumball machine with buyback enabled and a specific oracle signer
  const oracleSigner = umi.identity.publicKey;
  const gumballMachineSigner = await create(umi, {
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
    ],
    startSale: true,
    guards: {},
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      enabled: true,
      oracleSigner,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  const depositAmount = LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

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

  // Try to sell with a different oracle signer
  const invalidOracleSigner = generateSigner(umi);
  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 1,
        buyPrice: LAMPORTS_PER_SOL,
        oracleSigner: invalidOracleSigner,
        buyer: umi.identity.publicKey,
        mint: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /InvalidOracleSigner/ });
});

test('it cannot sell an item with insufficient buy back funds', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const nft = await createNft(umi);
  const oracleSigner = generateSigner(umi);

  // Create gumball machine with buyback enabled but limited funds
  const gumballMachineSigner = await create(umi, {
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
    ],
    startSale: true,
    guards: {},
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      enabled: true,
      oracleSigner: oracleSigner.publicKey,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit limited buy back funds
  const depositAmount = LAMPORTS_PER_SOL - 1;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

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

  // Try to sell with a price higher than available funds
  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 1,
        buyPrice: LAMPORTS_PER_SOL,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  await t.throwsAsync(promise, { message: /InsufficientFunds/ });
});

test('it cannot sell to a gumball without buyback enabled', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const nft = await createNft(umi);
  // Oracle signer (authorized to sell on behalf of sellers)
  const oracleSigner = generateSigner(umi);

  // Create gumball machine with buyback enabled
  const gumballMachineSigner = await create(umi, {
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
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

  const preBuyerTokenAccount = await umi.rpc.getBalance(
    buyerUmi.identity.publicKey
  );

  // Buyer cannot sell back to the seller
  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 1,
        buyPrice: LAMPORTS_PER_SOL,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  await t.throwsAsync(promise, { message: /BuyBackNotEnabled/ });
});

test('it cannot sell to a gumball with cutoff pct reached', async (t) => {
  const umi = await createUmi();
  const gumballMachineSigner = generateSigner(umi);
  const oracleSigner = generateSigner(umi);

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

  // Create gumball machine with buyback enabled
  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
        amount: 50,
        quantity: 2,
      },
    ],
    startSale: true,
    guards: {},
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
      cutoffPct: 50,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  const depositAmount = LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachineSigner.publicKey,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(buyerUmi, {
        gumballMachine,
      })
    )
    .add(
      draw(buyerUmi, {
        gumballMachine,
      })
    )
    .sendAndConfirm(buyerUmi);

  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 100,
        buyPrice: LAMPORTS_PER_SOL,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  await t.throwsAsync(promise, { message: /BuyBackCutoffReached/ });
});

test('it cannot sell a tokens item with a different amount', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const gumballMachineSigner = generateSigner(umi);
  const oracleSigner = generateSigner(umi);

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

  // Create gumball machine with buyback enabled
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
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
    },
  });
  const gumballMachine = gumballMachineSigner.publicKey;

  // Deposit buy back funds
  const depositAmount = LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

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

  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 1000,
        buyPrice: LAMPORTS_PER_SOL,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: tokenMint.publicKey,
        tokenStandard: TokenStandard.Fungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  await t.throwsAsync(promise, { message: /InvalidAmount/ });
});

test('it can sell an nft item, re-add it, and sell it again', async (t) => {
  // Given a gumball machine with a gumball guard that has no guards.
  const umi = await createUmi();
  const nfts = await Promise.all([createNft(umi), createNft(umi)]);
  // Oracle signer (authorized to sell on behalf of sellers)
  const oracleSigner = generateSigner(umi);

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: nfts[0].publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
      {
        id: nfts[1].publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
    ],
    startSale: true,
    guards: {
      solPayment: some({ lamports: sol(1) }),
    },
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      oracleSigner: oracleSigner.publicKey,
      enabled: true,
      cutoffPct: 0,
    },
  });

  // Deposit buy back funds
  const depositAmount = LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

  // When we mint from the gumball guard.
  const buyerUmi = await createUmi();
  const preBuyerBalance = await umi.rpc.getBalance(buyerUmi.identity.publicKey);
  const preSellerBalance = await umi.rpc.getBalance(umi.identity.publicKey);

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(buyerUmi, {
        gumballMachine,
        mintArgs: { solPayment: some(true) },
      })
    )
    .sendAndConfirm(buyerUmi);

  // Figure out which was drawn
  let gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  const drawnIndex = gumballMachineAccount.items.findIndex(
    (item) => item.isDrawn
  );

  // Buyer can sell back to the seller
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: drawnIndex,
        amount: 1,
        buyPrice: LAMPORTS_PER_SOL / 2,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: nfts[drawnIndex].publicKey,
        tokenStandard: TokenStandard.NonFungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: drawnIndex,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nfts[drawnIndex].publicKey,
        creators: [umi.identity.publicKey],
      })
    )
    .sendAndConfirm(umi);

  // When we re-add the nft to the Gumball Machine.
  await transactionBuilder()
    .add(
      addNft(umi, {
        gumballMachine,
        mint: nfts[drawnIndex].publicKey,
        args: {
          index: drawnIndex,
        },
      })
    )
    .sendAndConfirm(umi);

  // Draw all items
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(buyerUmi, {
        gumballMachine,
        mintArgs: { solPayment: some(true) },
      })
    )
    .add(
      draw(buyerUmi, {
        gumballMachine,
        mintArgs: { solPayment: some(true) },
      })
    )
    .sendAndConfirm(buyerUmi);

  // Buyer can sell back again to the seller
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      sellItem(buyerUmi, {
        gumballMachine,
        index: 0,
        amount: 1,
        buyPrice: LAMPORTS_PER_SOL / 2,
        oracleSigner,
        buyer: umi.identity.publicKey,
        mint: nfts[0].publicKey,
        tokenStandard: TokenStandard.NonFungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  const postBuyerBalance = await umi.rpc.getBalance(
    buyerUmi.identity.publicKey
  );

  // 3 draws @ 1 SOL + 2 sells @ .5 SOL means 2 SOL were spent
  t.true(
    isEqualToAmount(
      postBuyerBalance,
      subtractAmounts(preBuyerBalance, sol(2)),
      sol(0.001)
    )
  );

  // Then settle all sales
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nfts[0].publicKey,
        creators: [umi.identity.publicKey],
      })
    )
    .sendAndConfirm(umi);

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: 1,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nfts[1].publicKey,
        creators: [umi.identity.publicKey],
      })
    )
    .sendAndConfirm(umi);

  const postSellerBalance = await umi.rpc.getBalance(umi.identity.publicKey);

  // 3 draws @ 1 SOL
  t.true(
    isEqualToAmount(
      postSellerBalance,
      addAmounts(preSellerBalance, sol(3)),
      sol(0.001)
    )
  );

  // Then the Gumball Machine has been updated properly.
  gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 2,
    itemsRedeemed: 2n,
    itemsSettled: 2n,
    // All proceeds were settled
    totalProceedsSettled: sol(3).basisPoints,
    buyBackFundsAvailable: 0n,
    items: [
      {
        index: 0,
        isDrawn: true,
        isClaimed: true,
        isSettled: true,
        mint: nfts[0].publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
      {
        index: 1,
        isDrawn: true,
        isClaimed: true,
        isSettled: true,
        mint: nfts[1].publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
    ],
  });

  // Seller can close the gumball machine
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      closeGumballMachine(umi, {
        gumballMachine,
        gumballGuard: findGumballGuardPda(umi, { base: gumballMachine }),
      })
    )
    .sendAndConfirm(umi);
});
