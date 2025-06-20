import {
  fetchMetadataFromSeeds,
  TokenStandard as MplTokenStandard,
  transferV1,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  fetchToken,
  findAssociatedTokenPda,
  setComputeUnitLimit,
  TokenState,
} from '@metaplex-foundation/mpl-toolbox';
import {
  generateSigner,
  isSome,
  signerIdentity,
  sol,
  some,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  addNft,
  claimNft,
  draw,
  fetchGumballMachine,
  fetchSellerHistory,
  findGumballMachineAuthorityPda,
  findSellerHistoryPda,
  getMerkleProof,
  getMerkleRoot,
  GumballMachine,
  MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
  SellerHistory,
  settleNftSale,
  TokenStandard,
} from '../src';
import { create, createNft, createProgrammableNft, createUmi } from './_setup';

test('it can add nft to a gumball machine as the authority', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });
  const nft = await createNft(umi);

  // When we add an nft to the Gumball Machine.
  await transactionBuilder()
    .add(
      addNft(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 1,
    items: [
      {
        index: 0,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
    ],
  });

  // Then nft is frozen and delegated
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
    delegate: some(
      findGumballMachineAuthorityPda(umi, {
        gumballMachine: gumballMachine.publicKey,
      })[0]
    ),
  });

  // Seller history state is correct
  const sellerHistoryAccount = await fetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine: gumballMachine.publicKey,
      seller: umi.identity.publicKey,
    })[0]
  );

  t.like(sellerHistoryAccount, <SellerHistory>{
    gumballMachine: gumballMachine.publicKey,
    seller: umi.identity.publicKey,
    itemCount: 1n,
  });
});

test('it can add pnft to a gumball machine as the authority', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });
  const nft = await createProgrammableNft(umi, undefined, {
    withAuthRules: true,
  });

  const metadata = await fetchMetadataFromSeeds(umi, { mint: nft.publicKey });
  const ruleSet =
    isSome(metadata.programmableConfig) &&
    isSome(metadata.programmableConfig.value.ruleSet)
      ? metadata.programmableConfig.value.ruleSet.value
      : undefined;

  // When we add an nft to the Gumball Machine.
  await transactionBuilder()
    .add(
      setComputeUnitLimit(umi, {
        units: 300_000,
      })
    )
    .add(
      addNft(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
        authRulesProgram: MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
        authRules: ruleSet,
      })
    )
    .sendAndConfirm(umi);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 1,
    items: [
      {
        index: 0,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: nft.publicKey,
        seller: umi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
        amount: 1,
      },
    ],
  });

  // Then nft is frozen and delegated
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
    delegate: some(
      findGumballMachineAuthorityPda(umi, {
        gumballMachine: gumballMachine.publicKey,
      })[0]
    ),
  });

  // Seller history state is correct
  const sellerHistoryAccount = await fetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine: gumballMachine.publicKey,
      seller: umi.identity.publicKey,
    })[0]
  );

  t.like(sellerHistoryAccount, <SellerHistory>{
    gumballMachine: gumballMachine.publicKey,
    seller: umi.identity.publicKey,
    itemCount: 1n,
  });
});

test('it can add nft to a gumball machine as allowlisted seller', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const otherSellerUmi = await createUmi();
  const sellersMerkleRoot = getMerkleRoot([otherSellerUmi.identity.publicKey]);
  const gumballMachine = await create(umi, {
    settings: { itemCapacity: 5, sellersMerkleRoot },
  });
  const nft = await createNft(otherSellerUmi);

  // When we add an nft to the Gumball Machine.
  await transactionBuilder()
    .add(
      addNft(otherSellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
        args: {
          sellerProofPath: getMerkleProof(
            [otherSellerUmi.identity.publicKey],
            otherSellerUmi.identity.publicKey
          ),
        },
      })
    )
    .sendAndConfirm(otherSellerUmi);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 1,
    items: [
      {
        index: 0,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: nft.publicKey,
        seller: otherSellerUmi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
    ],
  });

  // Then nft is frozen and delegated
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: otherSellerUmi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Frozen,
    owner: otherSellerUmi.identity.publicKey,
    delegate: some(
      findGumballMachineAuthorityPda(umi, {
        gumballMachine: gumballMachine.publicKey,
      })[0]
    ),
  });
});

test('it can add nft to a gumball machine as allowlisted seller on allowlist of 10K addresses', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const otherSellerUmi = await createUmi();
  const addresses = Array.from(
    { length: 10_000 },
    (_, i) => generateSigner(umi).publicKey
  );
  addresses.push(otherSellerUmi.identity.publicKey);
  const sellersMerkleRoot = getMerkleRoot(addresses);
  const gumballMachine = await create(umi, {
    settings: { itemCapacity: 5, sellersMerkleRoot },
  });
  const nft = await createNft(otherSellerUmi);

  // When we add an nft to the Gumball Machine.
  await transactionBuilder()
    .add(
      addNft(otherSellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
        args: {
          sellerProofPath: getMerkleProof(
            addresses,
            otherSellerUmi.identity.publicKey
          ),
        },
      })
    )
    .sendAndConfirm(otherSellerUmi);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 1,
    items: [
      {
        index: 0,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: nft.publicKey,
        seller: otherSellerUmi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
    ],
  });

  // Then nft is frozen and delegated
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: otherSellerUmi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Frozen,
    owner: otherSellerUmi.identity.publicKey,
    delegate: some(
      findGumballMachineAuthorityPda(umi, {
        gumballMachine: gumballMachine.publicKey,
      })[0]
    ),
  });
});

test('it cannot add nft as non gumball authority when there is no seller allowlist set', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const otherSellerUmi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });
  const nft = await createNft(otherSellerUmi);

  // When we add an nft to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      addNft(otherSellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
      })
    )
    .sendAndConfirm(otherSellerUmi);

  await t.throwsAsync(promise, { message: /InvalidProofPath/ });
});

test('it cannot add nft as non-allowlisted seller when there is a seller allowlist set', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const otherSellerUmi = await createUmi();
  const gumballMachine = await create(umi, {
    settings: {
      itemCapacity: 5,
      sellersMerkleRoot: getMerkleRoot([umi.identity.publicKey]),
    },
  });
  const nft = await createNft(otherSellerUmi);

  // When we add an nft to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      addNft(otherSellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
      })
    )
    .sendAndConfirm(otherSellerUmi);

  await t.throwsAsync(promise, { message: /InvalidProofPath/ });
});

test('it can append additional nfts to a gumball machine', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 2 } });
  const nfts = await Promise.all([createNft(umi), createNft(umi)]);

  await transactionBuilder()
    .add(
      addNft(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nfts[0].publicKey,
      })
    )
    .sendAndConfirm(umi);

  // When we add an additional item to the Gumball Machine.
  await transactionBuilder()
    .add(
      addNft(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nfts[1].publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 2,
    items: [
      {
        index: 0,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: nfts[0].publicKey,
        seller: umi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
      {
        index: 1,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: nfts[1].publicKey,
        seller: umi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
    ],
  });
});

test('it cannot add nfts that would make the gumball machine exceed the maximum capacity', async (t) => {
  // Given an existing Gumball Machine with a capacity of 1 item.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 1 } });
  const nfts = await Promise.all([createNft(umi), createNft(umi)]);

  // When we try to add 2 nfts to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      addNft(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nfts[0].publicKey,
      })
    )
    .add(
      addNft(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nfts[1].publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Then we expect an error to be thrown.
  await t.throwsAsync(promise, {
    message: /IndexGreaterThanLength/,
  });
});

test('it cannot add nfts once the gumball machine is fully loaded', async (t) => {
  // Given an existing Gumball Machine with 2 nfts loaded and a capacity of 2 nfts.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 1 } });
  const nft = await createNft(umi);

  await transactionBuilder()
    .add(
      addNft(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
      })
    )
    .sendAndConfirm(umi);

  // When we try to add one more item to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      addNft(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: (await createNft(umi)).publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Then we expect an error to be thrown.
  await t.throwsAsync(promise, {
    message: /IndexGreaterThanLength/,
  });
});

test('it cannot add more nfts than allowed per seller', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const otherSellerUmi = await createUmi();
  const sellersMerkleRoot = getMerkleRoot([otherSellerUmi.identity.publicKey]);
  const gumballMachine = await create(umi, {
    settings: { itemCapacity: 2, itemsPerSeller: 1, sellersMerkleRoot },
  });
  const nfts = await Promise.all([
    createNft(otherSellerUmi),
    createNft(otherSellerUmi),
  ]);

  // When we add an nft to the Gumball Machine.
  await transactionBuilder()
    .add(
      addNft(otherSellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nfts[0].publicKey,
        args: {
          sellerProofPath: getMerkleProof(
            [otherSellerUmi.identity.publicKey],
            otherSellerUmi.identity.publicKey
          ),
        },
      })
    )
    .sendAndConfirm(otherSellerUmi);

  const promise = transactionBuilder()
    .add(
      addNft(otherSellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nfts[1].publicKey,
        args: {
          sellerProofPath: getMerkleProof(
            [otherSellerUmi.identity.publicKey],
            otherSellerUmi.identity.publicKey
          ),
        },
      })
    )
    .sendAndConfirm(otherSellerUmi);

  await t.throwsAsync(promise, { message: /SellerTooManyItems/ });
});

test('it can re-add nft to a gumball machine as the authority', async (t) => {
  // Given a Gumball Machine with 5 nfts.
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
      solPayment: some({ lamports: sol(1) }),
    },
  });

  const buyer = await generateSignerWithSol(umi, sol(10));
  const buyerUmi = await createUmi();
  buyerUmi.use(signerIdentity(buyer));

  // When we draw the nft from the Gumball Machine.
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        buyer,
        mintArgs: { solPayment: some(true) },
      })
    )
    .sendAndConfirm(umi);

  // Figure out which was drawn
  let gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  const drawnIndex = gumballMachineAccount.items.findIndex(
    (item) => item.isDrawn
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: drawnIndex,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyer.publicKey,
        seller: umi.identity.publicKey,
        mint: nfts[drawnIndex].publicKey,
        creators: [umi.identity.publicKey],
      })
    )
    .sendAndConfirm(umi);

  // Transfer back to the seller
  await transactionBuilder()
    .add(
      transferV1(buyerUmi, {
        mint: nfts[drawnIndex].publicKey,
        destinationOwner: umi.identity.publicKey,
        tokenStandard: MplTokenStandard.NonFungible,
      })
    )
    .sendAndConfirm(buyerUmi);

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

  // Then the Gumball Machine has been updated properly.
  gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 2,
    itemsRedeemed: 0n,
    itemsSettled: 0n,
    // Half of the proceeds were settled since we settled one item
    totalProceedsSettled: sol(0.5).basisPoints,
    items: [
      {
        index: 0,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: nfts[0].publicKey,
        seller: umi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
      {
        index: 1,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: nfts[1].publicKey,
        seller: umi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
    ],
  });

  // Then nft is frozen and delegated
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nfts[drawnIndex].publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Frozen,
    owner: umi.identity.publicKey,
    delegate: some(
      findGumballMachineAuthorityPda(umi, {
        gumballMachine,
      })[0]
    ),
  });

  // Seller history state is correct
  const sellerHistoryAccount = await fetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine,
      seller: umi.identity.publicKey,
    })[0]
  );

  t.like(sellerHistoryAccount, <SellerHistory>{
    gumballMachine,
    seller: umi.identity.publicKey,
    itemCount: 2n,
  });
});

test('it can re-add pnft to a gumball machine as the authority', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const nfts = await Promise.all([
    createProgrammableNft(umi),
    createProgrammableNft(umi),
  ]);

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: nfts[0].publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
      },
      {
        id: nfts[1].publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
      },
    ],
    startSale: true,
    guards: {
      solPayment: some({ lamports: sol(1) }),
    },
  });

  const buyer = await generateSignerWithSol(umi, sol(10));
  const buyerUmi = await createUmi();
  buyerUmi.use(signerIdentity(buyer));

  // When we draw the nft from the Gumball Machine.
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        buyer,
        mintArgs: { solPayment: some(true) },
      })
    )
    .sendAndConfirm(umi);

  // Figure out which was drawn
  let gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  const drawnIndex = gumballMachineAccount.items.findIndex(
    (item) => item.isDrawn
  );

  // Then settle the sale
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      settleNftSale(umi, {
        index: drawnIndex,
        gumballMachine,
        authority: umi.identity.publicKey,
        buyer: buyer.publicKey,
        seller: umi.identity.publicKey,
        mint: nfts[drawnIndex].publicKey,
        creators: [umi.identity.publicKey],
        authRulesProgram: MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
      })
    )
    .sendAndConfirm(umi);

  // Transfer back to the seller
  await transactionBuilder()
    .add(
      transferV1(buyerUmi, {
        mint: nfts[drawnIndex].publicKey,
        destinationOwner: umi.identity.publicKey,
        tokenStandard: MplTokenStandard.ProgrammableNonFungible,
      })
    )
    .sendAndConfirm(buyerUmi);

  // When we re-add the nft to the Gumball Machine.
  await transactionBuilder()
    .add(
      addNft(umi, {
        gumballMachine,
        mint: nfts[drawnIndex].publicKey,
        args: {
          index: drawnIndex,
        },
        authRulesProgram: MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
      })
    )
    .sendAndConfirm(umi);

  // Then the Gumball Machine has been updated properly.
  gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 2,
    itemsRedeemed: 0n,
    itemsSettled: 0n,
    // Half of the proceeds were settled since we settled one item
    totalProceedsSettled: sol(0.5).basisPoints,
    items: [
      {
        index: 0,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: nfts[0].publicKey,
        seller: umi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
        amount: 1,
      },
      {
        index: 1,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: nfts[1].publicKey,
        seller: umi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
        amount: 1,
      },
    ],
  });

  // Then nft is frozen and delegated
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nfts[drawnIndex].publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Frozen,
    owner: umi.identity.publicKey,
    delegate: some(
      findGumballMachineAuthorityPda(umi, {
        gumballMachine,
      })[0]
    ),
  });

  // Seller history state is correct
  const sellerHistoryAccount = await fetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine,
      seller: umi.identity.publicKey,
    })[0]
  );

  t.like(sellerHistoryAccount, <SellerHistory>{
    gumballMachine,
    seller: umi.identity.publicKey,
    itemCount: 2n,
  });
});

test('it cannot add nft without index to a live gumball machine', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const nfts = await Promise.all([createNft(umi), createNft(umi)]);

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: nfts[0].publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
      },
    ],
    startSale: true,
  });

  // When we add an nft to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      addNft(umi, {
        gumballMachine,
        mint: nfts[1].publicKey,
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /MissingItemIndex/ });
});

test('it cannot re-add nft to index with an unclaimed item', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const nfts = await Promise.all([createNft(umi), createNft(umi)]);

  const gumballMachineSigner = generateSigner(umi);
  const gumballMachine = gumballMachineSigner.publicKey;

  await create(umi, {
    gumballMachine: gumballMachineSigner,
    items: [
      {
        id: nfts[0].publicKey,
        tokenStandard: TokenStandard.ProgrammableNonFungible,
      },
    ],
    startSale: true,
  });

  // When we add an nft to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      addNft(umi, {
        gumballMachine,
        mint: nfts[0].publicKey,
        args: {
          index: 0,
        },
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /ItemNotClaimed/ });
});

test('it cannot re-add nft to index with an unsettled item', async (t) => {
  // Given a Gumball Machine with 5 nfts.
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
      solPayment: some({ lamports: sol(1) }),
    },
  });

  const buyer = await generateSignerWithSol(umi, sol(10));
  const buyerUmi = await createUmi();
  buyerUmi.use(signerIdentity(buyer));

  // When we draw the nft from the Gumball Machine.
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 600_000 }))
    .add(
      draw(umi, {
        gumballMachine,
        buyer,
        mintArgs: { solPayment: some(true) },
      })
    )
    .sendAndConfirm(umi);

  // Figure out which was drawn
  let gumballMachineAccount = await fetchGumballMachine(umi, gumballMachine);
  const drawnIndex = gumballMachineAccount.items.findIndex(
    (item) => item.isDrawn
  );

  // Claim the item as the buyer
  await transactionBuilder()
    .add(
      claimNft(umi, {
        gumballMachine,
        buyer: buyer.publicKey,
        mint: nfts[drawnIndex].publicKey,
        seller: umi.identity.publicKey,
        index: drawnIndex,
      })
    )
    .sendAndConfirm(buyerUmi);

  // When we add an nft to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      addNft(umi, {
        gumballMachine,
        mint: nfts[0].publicKey,
        args: {
          index: drawnIndex,
        },
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /ItemNotSettled/ });
});
