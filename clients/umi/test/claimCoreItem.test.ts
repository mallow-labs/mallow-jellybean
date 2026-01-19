import { drawJellybean } from '@mallow-labs/mallow-gumball';
import { AssetV1, fetchAsset } from '@metaplex-foundation/mpl-core';
import { transferSol } from '@metaplex-foundation/mpl-toolbox';
import {
  generateSigner,
  isEqualToAmount,
  isGreaterThanAmount,
  lamports,
  some,
  subtractAmounts,
} from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  claimCoreItem,
  fetchJellybeanMachineWithItems,
  fetchUnclaimedPrizesFromSeeds,
  JellybeanMachineAccountWithItemsData,
  JellybeanState,
  safeFetchUnclaimedPrizesFromSeeds,
  UnclaimedPrizes,
} from '../src';
import {
  create,
  createCoreAsset,
  createMasterEdition,
  createUmi,
  DEFAULT_MAX_SUPPLY,
  defaultAssetData,
} from './_setup';

test('it can claim an edition', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  const updatedUnclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(
    sellerUmi,
    {
      jellybeanMachine,
      buyer: buyer.publicKey,
    }
  );
  const drawnEditionNumber = updatedUnclaimedPrizes.prizes[0].editionNumber;

  const printAsset = generateSigner(buyerUmi);
  await claimCoreItem(buyerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
    collection: collectionSigner.publicKey,
    index: 0,
    printAsset,
  }).sendAndConfirm(buyerUmi);

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(sellerUmi, {
      jellybeanMachine,
      buyer: buyer.publicKey,
    })
  );

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.like(jellybeanMachineAccount, <JellybeanMachineAccountWithItemsData>{
    itemsLoaded: 1,
    supplyLoaded: BigInt(DEFAULT_MAX_SUPPLY),
    supplyRedeemed: 1n,
    state: JellybeanState.SaleLive,
    items: [
      {
        index: 0,
        mint: collectionSigner.publicKey,
        supplyLoaded: DEFAULT_MAX_SUPPLY,
        supplyRedeemed: 1,
      },
    ],
  });

  const printedAsset = await fetchAsset(sellerUmi, printAsset.publicKey);
  const assetData = defaultAssetData();
  t.like(printedAsset, <AssetV1>{
    name: assetData.name,
    uri: assetData.uri,
    owner: buyer.publicKey,
    updateAuthority: {
      type: 'Collection',
      address: collectionSigner.publicKey,
    },
    edition: {
      number: drawnEditionNumber,
    },
  });
});

test('it can claim a one of one asset', async (t) => {
  const sellerUmi = await createUmi();
  const assetSigner = await createCoreAsset(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  await claimCoreItem(buyerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(buyerUmi);

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(sellerUmi, {
      jellybeanMachine,
      buyer: buyer.publicKey,
    })
  );

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.like(jellybeanMachineAccount, <JellybeanMachineAccountWithItemsData>{
    itemsLoaded: 1,
    supplyLoaded: 1n,
    supplyRedeemed: 1n,
    state: JellybeanState.SaleEnded,
    items: [
      {
        index: 0,
        mint: assetSigner.publicKey,
        supplyLoaded: 1,
        supplyRedeemed: 1,
      },
    ],
  });

  const asset = await fetchAsset(sellerUmi, assetSigner.publicKey);
  const assetData = defaultAssetData();
  t.like(asset, <AssetV1>{
    name: assetData.name,
    uri: assetData.uri,
    owner: buyer.publicKey,
    updateAuthority: {
      type: 'Address',
      address: sellerUmi.identity.publicKey,
    },
  });
});

test('it can claim a one of one asset in a collection', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi, {
    plugins: [],
  });
  const assetSigner = await createCoreAsset(sellerUmi, {
    collection: collectionSigner,
  });

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  await claimCoreItem(buyerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
    asset: assetSigner.publicKey,
    collection: collectionSigner.publicKey,
    index: 0,
  }).sendAndConfirm(buyerUmi);

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(sellerUmi, {
      jellybeanMachine,
      buyer: buyer.publicKey,
    })
  );

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.like(jellybeanMachineAccount, <JellybeanMachineAccountWithItemsData>{
    itemsLoaded: 1,
    supplyLoaded: 1n,
    supplyRedeemed: 1n,
    state: JellybeanState.SaleEnded,
    items: [
      {
        index: 0,
        mint: assetSigner.publicKey,
        supplyLoaded: 1,
        supplyRedeemed: 1,
      },
    ],
  });

  const asset = await fetchAsset(sellerUmi, assetSigner.publicKey);
  const assetData = defaultAssetData();
  t.like(asset, <AssetV1>{
    name: assetData.name,
    uri: assetData.uri,
    owner: buyer.publicKey,
    updateAuthority: {
      type: 'Collection',
      address: collectionSigner.publicKey,
    },
  });
});

test('it can claim an edition with a different payer', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  const payerUmi = await createUmi();

  const printAsset = generateSigner(buyerUmi);
  const beforeBalance = await payerUmi.rpc.getBalance(
    payerUmi.identity.publicKey
  );

  await claimCoreItem(payerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
    collection: collectionSigner.publicKey,
    index: 0,
    printAsset,
  }).sendAndConfirm(payerUmi);

  const afterBalance = await payerUmi.rpc.getBalance(
    payerUmi.identity.publicKey
  );

  // Should only charge the tx fee as payer gets escrowed funds
  t.true(
    isEqualToAmount(
      afterBalance,
      subtractAmounts(beforeBalance, lamports(10_000))
    )
  );

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(sellerUmi, {
      jellybeanMachine,
      buyer: buyer.publicKey,
    })
  );

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.like(jellybeanMachineAccount, <JellybeanMachineAccountWithItemsData>{
    itemsLoaded: 1,
    supplyLoaded: BigInt(DEFAULT_MAX_SUPPLY),
    supplyRedeemed: 1n,
    state: JellybeanState.SaleLive,
    items: [
      {
        index: 0,
        mint: collectionSigner.publicKey,
        supplyLoaded: DEFAULT_MAX_SUPPLY,
        supplyRedeemed: 1,
        escrowAmount: 3427920n,
      },
    ],
  });

  const printedAsset = await fetchAsset(sellerUmi, printAsset.publicKey);
  const assetData = defaultAssetData();
  t.like(printedAsset, <AssetV1>{
    name: assetData.name,
    uri: assetData.uri,
    owner: buyer.publicKey,
    updateAuthority: {
      type: 'Collection',
      address: collectionSigner.publicKey,
    },
    edition: {
      number: 1,
    },
  });
});

test('it fails if the item index is invalid', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  const printAsset = generateSigner(buyerUmi);
  await t.throwsAsync(
    () =>
      claimCoreItem(buyerUmi, {
        jellybeanMachine,
        buyer: buyer.publicKey,
        collection: collectionSigner.publicKey,
        index: 1, // Invalid index.
        printAsset,
      }).sendAndConfirm(buyerUmi),
    { message: /InvalidItemIndex/ }
  );
});

test('it fails to claim an edition if the print asset is missing', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  await t.throwsAsync(
    () =>
      claimCoreItem(buyerUmi, {
        jellybeanMachine,
        buyer: buyer.publicKey,
        collection: collectionSigner.publicKey,
        index: 0,
        // printAsset is missing
      }).sendAndConfirm(buyerUmi),
    { message: /MissingPrintAsset/ }
  );
});

test('it fails if the prize has already been claimed', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  const printAsset = generateSigner(buyerUmi);
  await claimCoreItem(buyerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
    collection: collectionSigner.publicKey,
    index: 0,
    printAsset,
  }).sendAndConfirm(buyerUmi);

  // Claim again.
  await t.throwsAsync(
    () =>
      claimCoreItem(buyerUmi, {
        jellybeanMachine,
        buyer: buyer.publicKey,
        collection: collectionSigner.publicKey,
        index: 0,
        printAsset,
      }).sendAndConfirm(buyerUmi),
    { message: /AccountNotInitialized/ }
  );
});

test('it fails if the buyer is invalid', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer1 = await generateSignerWithSol(sellerUmi);
  const buyer1Umi = await createUmi(buyer1);

  await drawJellybean(buyer1Umi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyer1Umi);

  const buyer2 = await generateSignerWithSol(sellerUmi);
  const buyer2Umi = await createUmi(buyer2);

  const printAsset = generateSigner(buyer2Umi);
  await t.throwsAsync(
    () =>
      claimCoreItem(buyer2Umi, {
        jellybeanMachine,
        buyer: buyer2.publicKey,
        collection: collectionSigner.publicKey,
        index: 0,
        printAsset,
      }).sendAndConfirm(buyer2Umi),
    { message: /AccountNotInitialized./ }
  );
});

test('it can claim then draw then claim again', async (t) => {
  const sellerUmi = await createUmi();
  const assetSigners = await Promise.all([
    createCoreAsset(sellerUmi),
    createCoreAsset(sellerUmi),
  ]);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigners[0].publicKey,
      },
      {
        asset: assetSigners[1].publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  let unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });
  let drawnPrize = unclaimedPrizes.prizes[0];

  await claimCoreItem(buyerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
    asset: assetSigners[drawnPrize.itemIndex].publicKey,
    index: drawnPrize.itemIndex,
  }).sendAndConfirm(buyerUmi);

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(sellerUmi, {
      jellybeanMachine,
      buyer: buyer.publicKey,
    })
  );

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });
  drawnPrize = unclaimedPrizes.prizes[0];

  await claimCoreItem(buyerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
    asset: assetSigners[drawnPrize.itemIndex].publicKey,
    index: drawnPrize.itemIndex,
  }).sendAndConfirm(buyerUmi);

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(sellerUmi, {
      jellybeanMachine,
      buyer: buyer.publicKey,
    })
  );

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.like(jellybeanMachineAccount, <JellybeanMachineAccountWithItemsData>{
    itemsLoaded: 2,
    supplyLoaded: 2n,
    supplyRedeemed: 2n,
    state: JellybeanState.SaleEnded,
  });
});

test('it reallocates the unclaimed prizes account when it is not empty', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi, {
    maxSupply: 2,
  });

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  })
    .add(
      drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: {
          solPayment: some({
            feeAccounts: [sellerUmi.identity.publicKey],
          }),
        },
      })
    )
    .sendAndConfirm(buyerUmi);

  const printAsset = generateSigner(buyerUmi);

  let unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });

  const preBalance = await buyerUmi.rpc.getBalance(buyer.publicKey);
  await claimCoreItem(buyerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
    collection: collectionSigner.publicKey,
    index: 0,
    printAsset,
  }).sendAndConfirm(buyerUmi);

  const postBalance = await buyerUmi.rpc.getBalance(buyer.publicKey);
  t.true(isGreaterThanAmount(postBalance, preBalance));

  unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });
  t.like(unclaimedPrizes, <UnclaimedPrizes>{
    prizes: [
      {
        itemIndex: 0,
        editionNumber: 2,
      },
    ],
  });

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.like(jellybeanMachineAccount, <JellybeanMachineAccountWithItemsData>{
    itemsLoaded: 1,
    supplyLoaded: 2n,
    supplyRedeemed: 2n,
    state: JellybeanState.SaleEnded,
    items: [
      {
        index: 0,
        mint: collectionSigner.publicKey,
        supplyLoaded: 2,
        supplyRedeemed: 2,
      },
    ],
  });
});

test('it refunds rent to payer when buyer account is closed (single claim)', async (t) => {
  const sellerUmi = await createUmi();
  const assetSigner = await createCoreAsset(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
  });

  // Create buyer and draw
  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  // Drain remaining balance
  const remainingBalance = await buyerUmi.rpc.getBalance(buyer.publicKey);
  if (remainingBalance.basisPoints > 5000n) {
    await transferSol(buyerUmi, {
      source: buyer,
      destination: sellerUmi.identity.publicKey,
      amount: lamports(remainingBalance.basisPoints - 5000n),
    }).sendAndConfirm(buyerUmi);
  }

  // Verify buyer has very little or 0 lamports
  const finalBuyerBalance = await sellerUmi.rpc.getBalance(buyer.publicKey);
  t.true(finalBuyerBalance.basisPoints < 10000n);

  // Claim the asset with seller as payer - this should succeed
  // The rent from unclaimed_prizes should go to seller (payer), not buyer
  await claimCoreItem(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(sellerUmi);

  // Verify claim succeeded
  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(sellerUmi, {
      jellybeanMachine,
      buyer: buyer.publicKey,
    })
  );

  // Verify asset transferred to buyer
  const asset = await fetchAsset(sellerUmi, assetSigner.publicKey);
  t.is(asset.owner, buyer.publicKey);
});

test('it refunds excess rent to payer when buyer account is closed (partial claim)', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi, {
    maxSupply: 2,
  });

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  // Create buyer and draw twice
  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  })
    .add(
      drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: {
          solPayment: some({
            feeAccounts: [sellerUmi.identity.publicKey],
          }),
        },
      })
    )
    .sendAndConfirm(buyerUmi);

  // Verify buyer has 2 unclaimed prizes
  let unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });
  t.is(unclaimedPrizes.prizes.length, 2);

  // Drain remaining balance
  const remainingBalance = await buyerUmi.rpc.getBalance(buyer.publicKey);
  if (remainingBalance.basisPoints > 5000n) {
    await transferSol(buyerUmi, {
      source: buyer,
      destination: sellerUmi.identity.publicKey,
      amount: lamports(remainingBalance.basisPoints - 5000n),
    }).sendAndConfirm(buyerUmi);
  }

  // Verify buyer has very little or 0 lamports
  const finalBuyerBalance = await sellerUmi.rpc.getBalance(buyer.publicKey);
  t.true(finalBuyerBalance.basisPoints < 10000n);

  const printAsset = generateSigner(sellerUmi);

  // Partial claim with seller as payer - excess rent should go to seller (payer)
  await claimCoreItem(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
    collection: collectionSigner.publicKey,
    index: 0,
    printAsset,
  }).sendAndConfirm(sellerUmi);

  // Verify partial claim succeeded - one prize remaining
  unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });
  t.is(unclaimedPrizes.prizes.length, 1);

  // Verify the edition was printed to the buyer
  const printedAsset = await fetchAsset(sellerUmi, printAsset.publicKey);
  t.is(printedAsset.owner, buyer.publicKey);
});
