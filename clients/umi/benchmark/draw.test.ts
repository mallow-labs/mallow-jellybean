import { drawJellybean } from '@mallow-labs/mallow-gumball';
import {
  chunk,
  generateSigner,
  some,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  claimCoreItem,
  fetchJellybeanMachineWithItems,
  fetchUnclaimedPrizesFromSeeds,
  JellybeanMachineAccountWithItemsData,
  JellybeanState,
} from '../src';
import {
  create,
  createMasterEdition,
  createUmi,
  DEFAULT_MAX_SUPPLY,
} from '../test/_setup';

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

test('it can draw with many master editions', async (t) => {
  t.timeout(60_000);

  const count = 256;
  const drawCount = 100;
  const sellerUmi = await createUmi();
  const promises = Array.from({ length: count }, () =>
    createMasterEdition(sellerUmi)
  );
  const collectionSigners = await Promise.all(promises);
  const jellybeanMachine = await create(sellerUmi, {
    items: collectionSigners.map((signer) => ({
      collection: signer.publicKey,
    })),
    startSale: true,
  });

  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);

  const batches = chunk(
    Array.from({ length: drawCount }, () => null),
    8
  );
  for (const batch of batches) {
    let builder = transactionBuilder();
    batch.forEach(() => {
      builder = builder.add(
        drawJellybean(buyerUmi, {
          jellybeanMachine,
          mintArgs: {
            solPayment: some({
              feeAccounts: [sellerUmi.identity.publicKey],
            }),
          },
        })
      );
    });
    await builder.sendAndConfirm(buyerUmi);
  }

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.like(jellybeanMachineAccount, <JellybeanMachineAccountWithItemsData>{
    itemsLoaded: count,
    supplyLoaded: BigInt(DEFAULT_MAX_SUPPLY * count),
    supplyRedeemed: BigInt(drawCount),
    state: JellybeanState.SaleLive,
  });

  // Can claim final index
  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });
  const index =
    unclaimedPrizes.prizes[unclaimedPrizes.prizes.length - 1].itemIndex;
  const printAsset = generateSigner(buyerUmi);
  await claimCoreItem(buyerUmi, {
    jellybeanMachine,
    index,
    collection: collectionSigners[0].publicKey,
    printAsset,
  }).sendAndConfirm(buyerUmi);
});
