/* eslint-disable no-await-in-loop */
import {
  burnNft,
  fetchMetadata,
  findMasterEditionPda,
  findMetadataPda,
  updatePrimarySaleHappenedViaToken,
} from '@metaplex-foundation/mpl-token-metadata';
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
  lamports,
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
  claimNft,
  draw,
  endSale,
  fetchGumballMachine,
  findGumballMachineAuthorityPda,
  findSellerHistoryPda,
  GumballMachine,
  MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
  safeFetchSellerHistory,
  settleNftSale,
  TokenStandard,
} from '../src';
import { create, createNft, createProgrammableNft, createUmi } from './_setup';

test('it can settle an nft sale', async (t) => {
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
    disablePrimarySplit: true,
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
      settleNftSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
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
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
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
  // Then nft is unfrozen and revoked
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: buyer.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: buyer.publicKey,
    delegate: none(),
    amount: 1n,
  });

  // Primary sale was updated
  const metadataAccount = await fetchMetadata(
    umi,
    findMetadataPda(umi, { mint: nft.publicKey })
  );
  t.like(metadataAccount, {
    primarySaleHappened: true,
  });
});

test('it can settle an pnft sale', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const nft = await createProgrammableNft(umi);

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
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
      settleNftSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
        authRulesProgram: MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
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
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
        amount: 1,
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
  // Then nft is unfrozen and revoked
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: buyer.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Frozen,
    owner: buyer.publicKey,
    delegate: none(),
    amount: 1n,
  });
});

test('it splits proceeds for a primary nft sale with multiple creators after claim', async (t) => {
  const umi = await createUmi();

  const secondCreator = generateSigner(umi).publicKey;

  // Given a gumball machine with some guards.
  const nft = await createNft(umi, {
    creators: [
      { address: umi.identity.publicKey, verified: false, share: 50 },
      { address: secondCreator, verified: false, share: 50 },
    ],
  });

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
    settings: {
      curatorFeeBps: 0,
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

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const secondCreatorPreBalance = await umi.rpc.getBalance(secondCreator);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(buyerUmi, { units: 600_000 }))
    .add(
      settleNftSale(buyerUmi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey, secondCreator],
      })
    )
    .sendAndConfirm(buyerUmi);

  const payerBalance = await umi.rpc.getBalance(payer.publicKey);
  t.true(isEqualToAmount(payerBalance, sol(9), sol(0.1)));

  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const secondCreatorPostBalance = await umi.rpc.getBalance(secondCreator);
  const authorityPdaPostBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  t.true(
    isEqualToAmount(
      sellerPostBalance,
      addAmounts(sellerPreBalance, sol(0.5)),
      sol(0.01)
    )
  );

  t.true(
    isEqualToAmount(
      secondCreatorPostBalance,
      addAmounts(secondCreatorPreBalance, sol(0.5)),
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
});

test('it only splits royalty portion of proceeds for a primary nft sale with disablePrimarySplit set', async (t) => {
  const umi = await createUmi();

  const secondCreator = generateSigner(umi).publicKey;

  // Given a gumball machine with some guards.
  const nft = await createNft(umi, {
    creators: [
      { address: umi.identity.publicKey, verified: false, share: 50 },
      { address: secondCreator, verified: false, share: 50 },
    ],
  });

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
    settings: {
      curatorFeeBps: 0,
    },
    disablePrimarySplit: true,
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

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const secondCreatorPreBalance = await umi.rpc.getBalance(secondCreator);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(buyerUmi, { units: 600_000 }))
    .add(
      settleNftSale(buyerUmi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey, secondCreator],
      })
    )
    .sendAndConfirm(buyerUmi);

  const payerBalance = await umi.rpc.getBalance(payer.publicKey);
  t.true(isEqualToAmount(payerBalance, sol(9), sol(0.1)));

  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const secondCreatorPostBalance = await umi.rpc.getBalance(secondCreator);
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

  t.true(
    isEqualToAmount(
      secondCreatorPostBalance,
      addAmounts(secondCreatorPreBalance, sol(0.05)),
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
});

test('it splits proceeds for a primary nft sale with multiple creators before claim', async (t) => {
  const umi = await createUmi();
  const secondCreator = generateSigner(umi).publicKey;

  // Given a gumball machine with some guards.
  const nft = await createNft(umi, {
    creators: [
      { address: umi.identity.publicKey, verified: false, share: 50 },
      { address: secondCreator, verified: false, share: 50 },
    ],
  });

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
    settings: {
      curatorFeeBps: 0,
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
  const secondCreatorPreBalance = await umi.rpc.getBalance(secondCreator);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(buyerUmi, { units: 600_000 }))
    .add(
      settleNftSale(buyerUmi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey, secondCreator],
      })
    )
    .sendAndConfirm(buyerUmi);

  const payerBalance = await umi.rpc.getBalance(payer.publicKey);
  t.true(isEqualToAmount(payerBalance, sol(9), sol(0.1)));

  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const secondCreatorPostBalance = await umi.rpc.getBalance(secondCreator);
  const authorityPdaPostBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  t.true(
    isEqualToAmount(
      sellerPostBalance,
      addAmounts(sellerPreBalance, sol(0.5)),
      sol(0.01)
    )
  );

  t.true(
    isEqualToAmount(
      secondCreatorPostBalance,
      addAmounts(secondCreatorPreBalance, sol(0.5)),
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
});

test('it splits proceeds for a secondary nft sale with multiple creators after claim', async (t) => {
  const umi = await createUmi();
  const creatorUmi = await createUmi();
  const secondCreator = generateSigner(umi).publicKey;

  const nft = await createNft(creatorUmi, {
    creators: [
      { address: creatorUmi.identity.publicKey, verified: true, share: 50 },
      { address: secondCreator, verified: false, share: 50 },
    ],
    primarySaleHappened: true,
    tokenOwner: umi.identity.publicKey,
  });

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
    settings: {
      curatorFeeBps: 0,
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

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const firstCreatorPreBalance = await umi.rpc.getBalance(
    creatorUmi.identity.publicKey
  );
  const secondCreatorPreBalance = await umi.rpc.getBalance(secondCreator);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  const sellerHistoryAccount = findSellerHistoryPda(umi, {
    gumballMachine,
    seller: umi.identity.publicKey,
  })[0];

  const sellerHistoryAccountRent =
    await umi.rpc.getBalance(sellerHistoryAccount);

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(buyerUmi, { units: 600_000 }))
    .add(
      settleNftSale(buyerUmi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [creatorUmi.identity.publicKey, secondCreator],
      })
    )
    .sendAndConfirm(buyerUmi);

  const payerBalance = await umi.rpc.getBalance(payer.publicKey);
  t.true(isEqualToAmount(payerBalance, sol(9), sol(0.1)));

  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const firstCreatorPostBalance = await umi.rpc.getBalance(
    creatorUmi.identity.publicKey
  );
  const secondCreatorPostBalance = await umi.rpc.getBalance(secondCreator);
  const authorityPdaPostBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  t.true(
    isEqualToAmount(
      sellerPostBalance,
      addAmounts(
        addAmounts(sellerPreBalance, sol(0.9)),
        sellerHistoryAccountRent
      )
    )
  );

  t.true(
    isEqualToAmount(
      firstCreatorPostBalance,
      addAmounts(firstCreatorPreBalance, sol(0.05))
    )
  );

  t.true(
    isEqualToAmount(
      secondCreatorPostBalance,
      addAmounts(secondCreatorPreBalance, sol(0.05))
    )
  );

  t.true(
    isEqualToAmount(
      authorityPdaPostBalance,
      subtractAmounts(authorityPdaPreBalance, sol(1)),
      sol(0.01)
    )
  );
});

test('it splits proceeds for a secondary nft sale with multiple creators before claim', async (t) => {
  const umi = await createUmi();
  const creatorUmi = await createUmi();
  const secondCreator = generateSigner(umi).publicKey;

  const nft = await createNft(creatorUmi, {
    creators: [
      { address: creatorUmi.identity.publicKey, verified: true, share: 50 },
      { address: secondCreator, verified: false, share: 50 },
    ],
    primarySaleHappened: true,
    tokenOwner: umi.identity.publicKey,
  });

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
    settings: {
      curatorFeeBps: 0,
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
  const firstCreatorPreBalance = await umi.rpc.getBalance(
    creatorUmi.identity.publicKey
  );
  const secondCreatorPreBalance = await umi.rpc.getBalance(secondCreator);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  const sellerHistoryAccount = findSellerHistoryPda(umi, {
    gumballMachine,
    seller: umi.identity.publicKey,
  })[0];

  const sellerHistoryAccountRent =
    await umi.rpc.getBalance(sellerHistoryAccount);

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(buyerUmi, { units: 600_000 }))
    .add(
      settleNftSale(buyerUmi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [creatorUmi.identity.publicKey, secondCreator],
      })
    )
    .sendAndConfirm(buyerUmi);

  const payerBalance = await umi.rpc.getBalance(payer.publicKey);
  t.true(isEqualToAmount(payerBalance, sol(9), sol(0.1)));

  const sellerPostBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const firstCreatorPostBalance = await umi.rpc.getBalance(
    creatorUmi.identity.publicKey
  );
  const secondCreatorPostBalance = await umi.rpc.getBalance(secondCreator);
  const authorityPdaPostBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  t.true(
    isEqualToAmount(
      sellerPostBalance,
      addAmounts(
        addAmounts(sellerPreBalance, sol(0.9)),
        sellerHistoryAccountRent
      )
    )
  );

  t.true(
    isEqualToAmount(
      firstCreatorPostBalance,
      addAmounts(firstCreatorPreBalance, sol(0.05))
    )
  );

  t.true(
    isEqualToAmount(
      secondCreatorPostBalance,
      addAmounts(secondCreatorPreBalance, sol(0.05))
    )
  );

  t.true(
    isEqualToAmount(
      authorityPdaPostBalance,
      subtractAmounts(authorityPdaPreBalance, sol(1)),
      sol(0.01)
    )
  );
});

test('it can settle an nft sale as a third party', async (t) => {
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

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  const otherUmi = await createUmi();
  await transactionBuilder()
    .add(setComputeUnitLimit(otherUmi, { units: 600_000 }))
    .add(
      settleNftSale(otherUmi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
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
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
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
  // Then nft is unfrozen and revoked
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: buyer.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: buyer.publicKey,
    delegate: none(),
    amount: 1n,
  });
});

test('it can settle a pnft sale as a third party', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const nft = await createProgrammableNft(umi);

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
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
      settleNftSale(otherUmi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
        authRulesProgram: MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
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
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
        amount: 1,
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
  // Then nft is unfrozen and revoked
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: buyer.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Frozen,
    owner: buyer.publicKey,
    delegate: none(),
    amount: 1n,
  });
});

test('it can settle an nft that was not sold', async (t) => {
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

  await endSale(umi, { gumballMachine }).sendAndConfirm(umi);

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        buyer: defaultPublicKey(),
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
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
    state: TokenState.Initialized,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 1n,
  });
});

test('it can settle an pnft that was not sold', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const nft = await createProgrammableNft(umi);

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
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
      settleNftSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        buyer: defaultPublicKey(),
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
        authRulesProgram: MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
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

  // Seller should be the owner
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
});

test('it can settle an nft that was not sold with proceeds from another sale', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const nfts = await Promise.all([createNft(umi), createNft(umi)]);

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

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  let gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  const unsoldItem = gumballMachineAccount.items.find((i) => i.buyer == null)!;

  // Then settle the sale for the unsold nft
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: unsoldItem.index,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: publicKey(unsoldItem.seller),
        buyer: defaultPublicKey(),
        mint: publicKey(unsoldItem.mint),
        creators: [umi.identity.publicKey],
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
      addAmounts(sellerPreBalance, sol(0.5)),
      sol(0.01)
    )
  );

  t.true(
    isEqualToAmount(
      authorityPdaPostBalance,
      subtractAmounts(authorityPdaPreBalance, sol(0.5)),
      sol(0.01)
    )
  );

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

  // Seller should be the owner
  // Then nft is unfrozen and revoked
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
    amount: 1n,
  });
});

test('it can settle an nft that was not sold with proceeds from another sale with fee config', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const nfts = await Promise.all([createNft(umi), createNft(umi)]);

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;
  const feeAccount = generateSigner(umi).publicKey;

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

  // Then settle the sale for the unsold nft
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: unsoldItem.index,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: publicKey(unsoldItem.seller),
        buyer: defaultPublicKey(),
        mint: publicKey(unsoldItem.mint),
        creators: [umi.identity.publicKey],
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

  // Seller should be the owner
  // Then nft is unfrozen and revoked
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
    amount: 1n,
  });
});

test('it cannot settle an nft to the wrong buyer', async (t) => {
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

  // Then settle the sale for the unsold nft
  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        buyer: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /InvalidBuyer/ });
});

test('it can settle an nft sale where buyer is the seller', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  await umi.rpc.airdrop(umi.identity.publicKey, sol(10));
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
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
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
      settleNftSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
      })
    )
    .sendAndConfirm(umi);

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
  t.like(gumballMachineAccount, <GumballMachine>{
    itemsRedeemed: 1n,
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

  // Seller should be the owner
  // Then nft is unfrozen and revoked
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

test('it can settle an nft sale for claimed nft', async (t) => {
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

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  await claimNft(buyerUmi, {
    gumballMachine,
    index: 0,
    mint: nft.publicKey,
    seller: umi.identity.publicKey,
  }).sendAndConfirm(buyerUmi);

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyer.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
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
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
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
  // Then nft is unfrozen and revoked
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: buyer.publicKey,
    })[0]
  );

  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: buyer.publicKey,
    delegate: none(),
    amount: 1n,
  });
});

test('it can settle an nft sale with a marketplace config', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const nft = await createNft(umi);

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;
  const feeAccount = generateSigner(umi).publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: nft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
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
      settleNftSale(buyerUmi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
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
});

test('it omits sending proceeds for a creator if the amount is too small to keep the account alive', async (t) => {
  const umi = await createUmi();
  const secondCreator = generateSigner(umi).publicKey;

  // Given a gumball machine with some guards.
  const nft = await createNft(umi, {
    creators: [
      { address: umi.identity.publicKey, verified: false, share: 99 },
      { address: secondCreator, verified: false, share: 1 },
    ],
  });

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
      solPayment: { lamports: sol(0.001) },
    },
    settings: {
      curatorFeeBps: 0,
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
  await transactionBuilder()
    .add(setComputeUnitLimit(buyerUmi, { units: 600_000 }))
    .add(
      settleNftSale(buyerUmi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey, secondCreator],
      })
    )
    .sendAndConfirm(buyerUmi);

  const secondCreatorPostBalance = await umi.rpc.getBalance(secondCreator);
  t.true(isEqualToAmount(secondCreatorPostBalance, lamports(0)));
});

test('it can settle an nft sale with disableRoyalties', async (t) => {
  // Given a gumball machine with some guards.
  const umi = await createUmi();
  const creatorUmi = await createUmi();
  const nft = await createNft(creatorUmi, {
    tokenOwner: umi.identity.publicKey,
  });

  await updatePrimarySaleHappenedViaToken(umi, {
    metadata: findMetadataPda(umi, { mint: nft.publicKey }),
    owner: umi.identity,
    token: findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: umi.identity.publicKey,
    }),
  }).sendAndConfirm(umi);

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
    disablePrimarySplit: true,
    disableRoyalties: true,
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

  const creatorPreBalance = await umi.rpc.getBalance(
    creatorUmi.identity.publicKey
  );
  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [creatorUmi.identity.publicKey],
      })
    )
    .sendAndConfirm(umi);

  const payerBalance = await umi.rpc.getBalance(payer.publicKey);
  t.true(isEqualToAmount(payerBalance, sol(9), sol(0.1)));

  const creatorPostBalance = await umi.rpc.getBalance(
    creatorUmi.identity.publicKey
  );
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

  t.true(isEqualToAmount(creatorPostBalance, creatorPreBalance));
});

test('it can settle an nft sale after nft has been claimed and burnt', async (t) => {
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
    disablePrimarySplit: true,
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

  // Then claim and burn the nft
  await transactionBuilder()
    .add(setComputeUnitLimit(buyerUmi, { units: 600_000 }))
    .add(
      claimNft(buyerUmi, {
        gumballMachine,
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        index: 0,
      })
    )
    .add(
      burnNft(buyerUmi, {
        owner: buyerUmi.identity,
        mint: nft.publicKey,
        tokenAccount: findAssociatedTokenPda(buyerUmi, {
          mint: nft.publicKey,
          owner: buyerUmi.identity.publicKey,
        })[0],
        masterEditionAccount: findMasterEditionPda(buyerUmi, {
          mint: nft.publicKey,
        })[0],
      })
    )
    .sendAndConfirm(buyerUmi);

  const sellerPreBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  const authorityPdaPreBalance = await umi.rpc.getBalance(
    findGumballMachineAuthorityPda(umi, { gumballMachine: gumballMachine })[0]
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        seller: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
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
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: buyerUmi.identity.publicKey,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
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

test('it cannot settle an nft with the wrong metadata account', async (t) => {
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

  // Then settle the sale for the unsold nft
  const promise = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: 0,
        gumballMachine,
        authority: umi.identity.publicKey,
        seller: umi.identity.publicKey,
        buyer: umi.identity.publicKey,
        mint: nft.publicKey,
        creators: [umi.identity.publicKey],
        metadata: generateSigner(umi).publicKey,
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /Invalid metadata PDA/ });
});
