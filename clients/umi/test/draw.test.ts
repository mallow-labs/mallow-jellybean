import { drawJellybean } from '@mallow-labs/mallow-gumball';
import { some } from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  endSale,
  fetchJellybeanMachineWithItems,
  fetchUnclaimedPrizesFromSeeds,
  JellybeanMachineAccountWithItemsData,
  JellybeanState,
  UnclaimedPrizes,
} from '../src';
import {
  create,
  createCoreAsset,
  createMasterEdition,
  createUmi,
  DEFAULT_MAX_SUPPLY,
} from './_setup';

test('it can draw an item from a master edition', async (t) => {
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

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });

  t.is(unclaimedPrizes.prizes.length, 1);
  t.is(unclaimedPrizes.prizes[0].itemIndex, 0);
  t.is(unclaimedPrizes.prizes[0].editionNumber, 1);
  t.is(unclaimedPrizes.jellybeanMachine, jellybeanMachine);
  t.is(unclaimedPrizes.buyer, buyer.publicKey);

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
});

test('it can draw a one-of-one asset', async (t) => {
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

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });

  t.is(unclaimedPrizes.prizes.length, 1);
  t.is(unclaimedPrizes.prizes[0].itemIndex, 0);
  t.is(unclaimedPrizes.prizes[0].editionNumber, 1);

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.like(jellybeanMachineAccount, <JellybeanMachineAccountWithItemsData>{
    itemsLoaded: 1,
    supplyLoaded: 1n,
    supplyRedeemed: 1n,
    state: JellybeanState.SaleEnded, // Should end after drawing the only item
    items: [
      {
        index: 0,
        mint: assetSigner.publicKey,
        supplyLoaded: 1,
        supplyRedeemed: 1,
      },
    ],
  });
});

test('it can draw multiple items from multiple collections', async (t) => {
  const sellerUmi = await createUmi();
  const collection1 = await createMasterEdition(sellerUmi, { maxSupply: 50 });
  const collection2 = await createMasterEdition(sellerUmi, { maxSupply: 30 });

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collection1.publicKey,
      },
      {
        collection: collection2.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  // Draw multiple items
  for (let i = 0; i < 5; i++) {
    await drawJellybean(buyerUmi, {
      jellybeanMachine,
      mintArgs: {
        solPayment: some({
          feeAccounts: [sellerUmi.identity.publicKey],
        }),
      },
    }).sendAndConfirm(buyerUmi);
  }

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });

  t.is(unclaimedPrizes.prizes.length, 5);

  // Verify that each prize has valid item index and edition number
  unclaimedPrizes.prizes.forEach((prize) => {
    t.true(prize.itemIndex >= 0 && prize.itemIndex <= 1);
    t.true(prize.editionNumber >= 1);
  });

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.supplyRedeemed, 5n);
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleLive);
});

test('it can draw items from mixed asset types', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi, {
    maxSupply: 10,
  });
  const assetSigner = await createCoreAsset(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  // Draw multiple items to get both types
  for (let i = 0; i < 3; i++) {
    await drawJellybean(buyerUmi, {
      jellybeanMachine,
      mintArgs: {
        solPayment: some({
          feeAccounts: [sellerUmi.identity.publicKey],
        }),
      },
    }).sendAndConfirm(buyerUmi);
  }

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });

  t.is(unclaimedPrizes.prizes.length, 3);

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.supplyRedeemed, 3n);
});

test('it fails to draw when jellybean machine is empty', async (t) => {
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

  // Draw the only item
  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  // Try to draw again when machine is empty
  await t.throwsAsync(
    () =>
      drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: {
          solPayment: some({
            feeAccounts: [sellerUmi.identity.publicKey],
          }),
        },
      }).sendAndConfirm(buyerUmi),
    { message: /InvalidState/ }
  );
});

test('it fails to draw when sale is not live', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: false, // Sale not started
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await t.throwsAsync(
    () =>
      drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: {
          solPayment: some({
            feeAccounts: [sellerUmi.identity.publicKey],
          }),
        },
      }).sendAndConfirm(buyerUmi),
    { message: /InvalidState/ }
  );
});

test('it fails to draw when sale has ended', async (t) => {
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

  // End the sale
  await endSale(sellerUmi, {
    jellybeanMachine,
  }).sendAndConfirm(sellerUmi);

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  await t.throwsAsync(
    () =>
      drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: {
          solPayment: some({
            feeAccounts: [sellerUmi.identity.publicKey],
          }),
        },
      }).sendAndConfirm(buyerUmi),
    { message: /InvalidState/ }
  );
});

test('it initializes unclaimed prizes account on first draw', async (t) => {
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

  // Check that unclaimed prizes account doesn't exist before drawing
  await t.throwsAsync(
    () =>
      fetchUnclaimedPrizesFromSeeds(sellerUmi, {
        jellybeanMachine,
        buyer: buyer.publicKey,
      }),
    { message: /The account of type \[UnclaimedPrizes\] was not found/ }
  );

  // Draw an item
  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  // Now unclaimed prizes account should exist and be initialized
  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });

  t.like(unclaimedPrizes, <UnclaimedPrizes>{
    version: 0,
    jellybeanMachine,
    buyer: buyer.publicKey,
  });

  t.is(unclaimedPrizes.prizes.length, 1);
});

test('it handles multiple buyers drawing from the same machine', async (t) => {
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
  const buyer2 = await generateSignerWithSol(sellerUmi);
  const buyer2Umi = await createUmi(buyer2);

  // Both buyers draw items
  await drawJellybean(buyer1Umi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyer1Umi);

  await drawJellybean(buyer2Umi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [sellerUmi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyer2Umi);

  // Check that each buyer has their own unclaimed prizes account
  const buyer1Prizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer1.publicKey,
  });

  const buyer2Prizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer2.publicKey,
  });

  t.is(buyer1Prizes.prizes.length, 1);
  t.is(buyer2Prizes.prizes.length, 1);
  t.is(buyer1Prizes.buyer, buyer1.publicKey);
  t.is(buyer2Prizes.buyer, buyer2.publicKey);

  // Both should have different edition numbers
  t.not(
    buyer1Prizes.prizes[0].editionNumber,
    buyer2Prizes.prizes[0].editionNumber
  );

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.supplyRedeemed, 2n);
});

test('it can draw all items from a master edition', async (t) => {
  const sellerUmi = await createUmi();
  const collectionSigner = await createMasterEdition(sellerUmi, {
    maxSupply: 3,
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

  // Draw all 3 items
  for (let i = 0; i < 3; i++) {
    await drawJellybean(buyerUmi, {
      jellybeanMachine,
      mintArgs: {
        solPayment: some({
          feeAccounts: [sellerUmi.identity.publicKey],
        }),
      },
    }).sendAndConfirm(buyerUmi);
  }

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });

  t.is(unclaimedPrizes.prizes.length, 3);

  // Verify that edition numbers are unique
  const editionNumbers = unclaimedPrizes.prizes
    .map((p) => p.editionNumber)
    .sort();
  t.deepEqual(editionNumbers, [1, 2, 3]);

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.supplyRedeemed, 3n);
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleEnded);

  // Try to draw again - should fail
  await t.throwsAsync(
    () =>
      drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: {
          solPayment: some({
            feeAccounts: [sellerUmi.identity.publicKey],
          }),
        },
      }).sendAndConfirm(buyerUmi),
    { message: /InvalidState/ }
  );
});

test('it draws items with reasonable randomness distribution', async (t) => {
  const sellerUmi = await createUmi();

  // Create multiple collections to increase the pool of available items
  const collection1 = await createMasterEdition(sellerUmi, { maxSupply: 10 });
  const collection2 = await createMasterEdition(sellerUmi, { maxSupply: 10 });
  const collection3 = await createMasterEdition(sellerUmi, { maxSupply: 10 });

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      { collection: collection1.publicKey },
      { collection: collection2.publicKey },
      { collection: collection3.publicKey },
    ],
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  // Draw 15 items (50% of total supply)
  const drawCount = 15;

  for (let i = 0; i < drawCount; i++) {
    await drawJellybean(buyerUmi, {
      jellybeanMachine,
      mintArgs: {
        solPayment: some({
          feeAccounts: [sellerUmi.identity.publicKey],
        }),
      },
    }).sendAndConfirm(buyerUmi);
  }

  // Get the latest prize to track which item was drawn
  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });

  const drawnItems = unclaimedPrizes.prizes.map((p) => p.itemIndex);

  // Test 1: Verify all items were actually drawn
  t.is(drawnItems.length, drawCount);

  // Test 2: Check that multiple different items were selected (not just one item repeatedly)
  const uniqueItems = new Set(drawnItems);
  t.true(
    uniqueItems.size > 1,
    'Should draw from multiple different items, not just one'
  );

  // Test 3: Check distribution is somewhat balanced (no single item should dominate too heavily)
  // Count how many times each item was drawn
  const itemCounts = [0, 0, 0];
  drawnItems.forEach((itemIndex) => {
    itemCounts[itemIndex]++;
  });

  // With perfect randomness, each item should be drawn ~5 times (15/3)
  // We'll accept a reasonable variance - no item should have 0 draws or more than 12 draws
  // This gives us confidence that the selection isn't completely biased
  itemCounts.forEach((count, index) => {
    t.true(count > 0, `Item ${index} should be drawn at least once`);
    t.true(
      count < 12,
      `Item ${index} should not dominate draws (drawn ${count} times)`
    );
  });

  // Test 4: Verify the sequence isn't purely sequential
  // If draws were sequential, we'd see patterns like [0,0,0,0,0,1,1,1,1,1,2,2,2,2,2]
  // Random draws should show more variation in adjacent selections
  let sequentialRuns = 0;
  let currentRun = 1;

  for (let i = 1; i < drawnItems.length; i++) {
    if (drawnItems[i] === drawnItems[i - 1]) {
      currentRun++;
    } else {
      if (currentRun >= 4) {
        // 4+ consecutive same items suggests non-randomness
        sequentialRuns++;
      }
      currentRun = 1;
    }
  }

  // Check the final run
  if (currentRun >= 4) {
    sequentialRuns++;
  }

  // With true randomness, we shouldn't see many long sequential runs
  t.true(
    sequentialRuns <= 1,
    `Too many sequential runs detected (${sequentialRuns}), suggesting non-random selection`
  );

  // Test 5: Verify the jellybean machine state is correct after draws
  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );

  t.is(jellybeanMachineAccount.supplyRedeemed, BigInt(drawCount));
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleLive);

  // Verify individual item supplies are updated correctly
  let totalItemsRedeemed = 0;
  jellybeanMachineAccount.items.forEach((item, index) => {
    t.is(item.supplyRedeemed, itemCounts[index]);
    totalItemsRedeemed += item.supplyRedeemed;
  });

  t.is(totalItemsRedeemed, drawCount);
});
