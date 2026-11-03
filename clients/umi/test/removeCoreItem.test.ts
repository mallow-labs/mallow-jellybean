import { drawJellybean } from '@mallow-labs/mallow-gumball';
import { fetchAsset, fetchCollection } from '@metaplex-foundation/mpl-core';
import { isGreaterThanAmount, some } from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  addCoreItem,
  claimCoreItem,
  closeJellybeanMachine,
  endSale,
  fetchJellybeanMachineWithItems,
  fetchUnclaimedPrizesFromSeeds,
  JellybeanState,
  removeCoreItem,
} from '../src';
import {
  create,
  createCoreAsset,
  createMasterEdition,
  createUmi,
  DEFAULT_MAX_SUPPLY,
} from './_setup';

test('it can remove a one-of-one asset from a jellybean machine', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Verify the asset was added
  let jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 1);
  t.is(jellybeanMachineAccount.supplyLoaded, 1n);

  // Verify the asset is owned by the authority PDA before removal
  let asset = await fetchAsset(umi, assetSigner.publicKey);
  t.not(asset.owner, umi.identity.publicKey);

  // Remove the asset
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify the asset was removed from the jellybean machine
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);
  t.is(jellybeanMachineAccount.supplyLoaded, 0n);

  // Verify the asset is now owned by the authority
  asset = await fetchAsset(umi, assetSigner.publicKey);
  t.is(asset.owner, umi.identity.publicKey);
});

test('it can remove a master edition from a jellybean machine', async (t) => {
  const umi = await createUmi();
  const collectionSigner = await createMasterEdition(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
  });

  // Verify the collection was added
  let jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 1);
  t.is(jellybeanMachineAccount.supplyLoaded, BigInt(DEFAULT_MAX_SUPPLY));

  // Remove the collection
  await removeCoreItem(umi, {
    jellybeanMachine,
    collection: collectionSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify the collection was removed from the jellybean machine
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);
  t.is(jellybeanMachineAccount.supplyLoaded, 0n);

  // Verify the collection update authority is back to the original authority
  const collection = await fetchCollection(umi, collectionSigner.publicKey);
  t.is(collection.updateAuthority, umi.identity.publicKey);
});

test('it can remove an asset that is part of a collection', async (t) => {
  const umi = await createUmi();
  const collectionSigner = await createMasterEdition(umi, {
    plugins: [],
  });
  const assetSigner = await createCoreAsset(umi, {
    collection: collectionSigner,
  });

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
        collection: collectionSigner.publicKey,
      },
    ],
  });

  // Verify the asset was added
  let jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 1);
  t.is(jellybeanMachineAccount.supplyLoaded, 1n);

  // Remove the asset
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    collection: collectionSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify the asset was removed from the jellybean machine
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);
  t.is(jellybeanMachineAccount.supplyLoaded, 0n);

  // Verify the asset is now owned by the authority
  const asset = await fetchAsset(umi, assetSigner.publicKey);
  t.is(asset.owner, umi.identity.publicKey);
});

test('it can remove multiple items by removing them one by one', async (t) => {
  const umi = await createUmi();
  const asset1Signer = await createCoreAsset(umi);
  const asset2Signer = await createCoreAsset(umi);
  const collectionSigner = await createMasterEdition(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: asset1Signer.publicKey,
      },
      {
        asset: asset2Signer.publicKey,
      },
      {
        collection: collectionSigner.publicKey,
      },
    ],
  });

  // Verify all items were added
  let jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 3);
  t.is(jellybeanMachineAccount.supplyLoaded, BigInt(2 + DEFAULT_MAX_SUPPLY));

  // Remove the first asset (index 0)
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: asset1Signer.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify first asset was removed
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 2);
  t.is(jellybeanMachineAccount.supplyLoaded, BigInt(1 + DEFAULT_MAX_SUPPLY));

  // Remove the collection (now at index 1 after first removal)
  await removeCoreItem(umi, {
    jellybeanMachine,
    collection: collectionSigner.publicKey,
    index: 1,
  }).sendAndConfirm(umi);

  // Verify collection was removed
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 1);
  t.is(jellybeanMachineAccount.supplyLoaded, 1n);

  // Remove the last asset (now at index 0)
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: asset2Signer.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify all items were removed
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);
  t.is(jellybeanMachineAccount.supplyLoaded, 0n);
});

test('it fails when trying to remove with invalid authority', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);
  const invalidAuthority = await generateSignerWithSol(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Try to remove with invalid authority
  const promise = removeCoreItem(await createUmi(invalidAuthority), {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(await createUmi(invalidAuthority));

  await t.throwsAsync(promise, { message: /InvalidAuthority/ });
});

test('it fails when trying to remove from a jellybean machine that has started sale', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
  });

  // Verify the sale has started
  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleLive);

  // Try to remove item from a live sale
  const promise = removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /InvalidState/ });
});

test('it fails when trying to remove with invalid index', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Try to remove with index out of bounds
  const promise = removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 1, // Only index 0 exists
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise);
});

test('it fails when trying to remove without providing asset or collection', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Try to remove without providing asset or collection
  const promise = removeCoreItem(umi, {
    jellybeanMachine,
    index: 0,
    // Neither asset nor collection provided
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /InvalidAsset/ });
});

test('it fails when trying to remove with mismatched asset', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);
  const wrongAssetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Try to remove with wrong asset
  const promise = removeCoreItem(umi, {
    jellybeanMachine,
    asset: wrongAssetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /Invalid asset/ });
});

test('it fails when trying to remove with mismatched collection', async (t) => {
  const umi = await createUmi();
  const collectionSigner = await createMasterEdition(umi);
  const wrongCollectionSigner = await createMasterEdition(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
  });

  // Try to remove with wrong asset
  const promise = removeCoreItem(umi, {
    jellybeanMachine,
    collection: wrongCollectionSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /Invalid collection/ });
});

test('it can re-add an asset after removing it', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  // Remove the asset
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify the asset was removed
  let jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);

  // Re-add the asset
  await addCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
  }).sendAndConfirm(umi);

  // Verify the asset was re-added
  jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 1);
  t.is(jellybeanMachineAccount.supplyLoaded, 1n);
});

test('it returns rent for machine use when removing an asset', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  const initialBalance = await umi.rpc.getBalance(umi.identity.publicKey);

  // Remove the asset
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  const finalBalance = await umi.rpc.getBalance(umi.identity.publicKey);
  t.true(
    isGreaterThanAmount(finalBalance, initialBalance),
    `Final balance ${finalBalance.basisPoints} should be greater than initial balance ${initialBalance.basisPoints}`
  );
});

test('it can remove a one-of-one asset after being claimed', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyerUmi = await createUmi();
  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: {
        feeAccounts: [umi.identity.publicKey],
      },
    },
  }).sendAndConfirm(buyerUmi);

  await claimCoreItem(buyerUmi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(buyerUmi);

  // Remove the asset
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify the asset was removed from the jellybean machine
  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 0);
  t.is(jellybeanMachineAccount.supplyLoaded, 0n);

  // Verify the asset is owned by the buyer
  const asset = await fetchAsset(umi, assetSigner.publicKey);
  t.is(asset.owner, buyerUmi.identity.publicKey);
});

test('it fails when trying to remove a one-of-one asset before being claimed', async (t) => {
  const umi = await createUmi();
  const assetSigner = await createCoreAsset(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyerUmi = await createUmi();
  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: {
        feeAccounts: [umi.identity.publicKey],
      },
    },
  }).sendAndConfirm(buyerUmi);

  await t.throwsAsync(
    removeCoreItem(umi, {
      jellybeanMachine,
      asset: assetSigner.publicKey,
      index: 0,
    }).sendAndConfirm(umi),
    { message: /ItemNotFullyClaimed/ }
  );
});

test('it fails when trying to remove a master edition before sale has ended', async (t) => {
  const umi = await createUmi();
  const collectionSigner = await createMasterEdition(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyerUmi = await createUmi();
  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: {
        feeAccounts: [umi.identity.publicKey],
      },
    },
  }).sendAndConfirm(buyerUmi);

  await t.throwsAsync(
    removeCoreItem(umi, {
      jellybeanMachine,
      collection: collectionSigner.publicKey,
      index: 0,
    }).sendAndConfirm(umi),
    { message: /InvalidState/ }
  );
});

test('it can remove the first item when there are multiple items', async (t) => {
  const umi = await createUmi();
  const assetSigners = await Promise.all([
    createCoreAsset(umi),
    createCoreAsset(umi),
  ]);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        asset: assetSigners[0].publicKey,
      },
      {
        asset: assetSigners[1].publicKey,
      },
    ],
  });

  // Remove the asset
  await removeCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigners[0].publicKey,
    index: 0,
  }).sendAndConfirm(umi);

  // Verify the asset was removed from the jellybean machine
  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.itemsLoaded, 1);
  t.is(jellybeanMachineAccount.supplyLoaded, 1n);
  t.is(jellybeanMachineAccount.items.length, 1);
  t.is(jellybeanMachineAccount.items[0].mint, assetSigners[1].publicKey);
});

test('it fails when trying to remove a master edition before being fully claimed', async (t) => {
  const umi = await createUmi();
  const collectionSigner = await createMasterEdition(umi);

  const jellybeanMachine = await create(umi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
  });

  const buyerUmi = await createUmi();
  await drawJellybean(buyerUmi, {
    jellybeanMachine,
    mintArgs: {
      solPayment: some({
        feeAccounts: [umi.identity.publicKey],
      }),
    },
  }).sendAndConfirm(buyerUmi);

  await endSale(umi, {
    jellybeanMachine,
  }).sendAndConfirm(umi);

  await t.throwsAsync(
    removeCoreItem(umi, {
      jellybeanMachine,
      collection: collectionSigner.publicKey,
      index: 0,
    }).sendAndConfirm(umi),
    { message: /ItemNotFullyClaimed/ }
  );
});

/**
 * Three one-of-ones, all drawn by different buyers, so the sale has ended and
 * every item has one prize outstanding. `buyerByItem[i]` drew the item at slot i.
 */
const createSoldOutMachine = async () => {
  const sellerUmi = await createUmi();
  const assets = [
    await createCoreAsset(sellerUmi),
    await createCoreAsset(sellerUmi),
    await createCoreAsset(sellerUmi),
  ];
  const jellybeanMachine = await create(sellerUmi, {
    items: assets.map((asset) => ({ asset: asset.publicKey })),
    startSale: true,
  });

  const buyerByItem: Awaited<ReturnType<typeof createUmi>>[] = [];
  for (let i = 0; i < assets.length; i += 1) {
    const buyer = await generateSignerWithSol(sellerUmi);
    const buyerUmi = await createUmi(buyer);
    await drawJellybean(buyerUmi, {
      jellybeanMachine,
      mintArgs: {
        solPayment: some({ feeAccounts: [sellerUmi.identity.publicKey] }),
      },
    }).sendAndConfirm(buyerUmi);
    const { prizes } = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
      jellybeanMachine,
      buyer: buyer.publicKey,
    });
    buyerByItem[prizes[0].itemIndex] = buyerUmi;
  }

  const claim = (index: number) =>
    claimCoreItem(buyerByItem[index], {
      jellybeanMachine,
      buyer: buyerByItem[index].identity.publicKey,
      asset: assets[index].publicKey,
      index,
    }).sendAndConfirm(buyerByItem[index]);

  const remove = (index: number) =>
    removeCoreItem(sellerUmi, {
      jellybeanMachine,
      asset: assets[index].publicKey,
      index,
    }).sendAndConfirm(sellerUmi);

  return { sellerUmi, assets, jellybeanMachine, buyerByItem, claim, remove };
};

test('it refuses to shift an item that still has prizes outstanding', async (t) => {
  const { sellerUmi, assets, jellybeanMachine, buyerByItem, claim, remove } =
    await createSoldOutMachine();

  await claim(0);

  // Item 0 is fully claimed, but removing it would move the items above it.
  await t.throwsAsync(() => remove(0), { message: /ItemNotFullyClaimed/ });

  // The outstanding prizes still resolve to the items they drew.
  await claim(1);
  await claim(2);
  for (const index of [1, 2]) {
    const asset = await fetchAsset(sellerUmi, assets[index].publicKey);
    t.is(asset.owner, buyerByItem[index].identity.publicKey);
  }

  const account = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.is(account.itemsLoaded, 3);
});

test.serial(
  'it refuses to shift an outstanding prize past an unsold item',
  async (t) => {
    const realNow = Date.now;
    t.teardown(() => {
      Date.now = realNow;
    });

    // The draw's seed subtracts the clock, so one of two consecutive seconds lands
    // on the upper item and leaves the lower one unsold. Serial tests run before
    // the concurrent ones, so pinning the clock disturbs nothing.
    const outcomes = new Set<number>();
    for (const seconds of [1_800_000_000, 1_800_000_001]) {
      Date.now = () => seconds * 1000;

      const sellerUmi = await createUmi();
      const assets = [
        await createCoreAsset(sellerUmi),
        await createCoreAsset(sellerUmi),
      ];
      const jellybeanMachine = await create(sellerUmi, {
        items: assets.map((asset) => ({ asset: asset.publicKey })),
        startSale: true,
      });

      const buyer = await generateSignerWithSol(sellerUmi);
      const buyerUmi = await createUmi(buyer);
      await drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: {
          solPayment: some({ feeAccounts: [sellerUmi.identity.publicKey] }),
        },
      }).sendAndConfirm(buyerUmi);
      await endSale(sellerUmi, { jellybeanMachine }).sendAndConfirm(sellerUmi);

      const { prizes } = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
        jellybeanMachine,
        buyer: buyer.publicKey,
      });
      const drawn = prizes[0].itemIndex;
      const unsold = 1 - drawn;
      outcomes.add(drawn);

      const removeUnsold = () =>
        removeCoreItem(sellerUmi, {
          jellybeanMachine,
          asset: assets[unsold].publicKey,
          index: unsold,
        }).sendAndConfirm(sellerUmi);

      if (unsold < drawn) {
        await t.throwsAsync(removeUnsold, { message: /ItemNotFullyClaimed/ });
      } else {
        // Nothing sits above the last slot, so nothing moves.
        await removeUnsold();
      }

      await claimCoreItem(buyerUmi, {
        jellybeanMachine,
        buyer: buyer.publicKey,
        asset: assets[drawn].publicKey,
        index: drawn,
      }).sendAndConfirm(buyerUmi);
      const asset = await fetchAsset(sellerUmi, assets[drawn].publicKey);
      t.is(asset.owner, buyer.publicKey);
    }
    t.is(outcomes.size, 2);
  }
);

test('it can remove the top item while lower ones have prizes outstanding', async (t) => {
  const { sellerUmi, jellybeanMachine, claim, remove } =
    await createSoldOutMachine();

  await claim(2);
  await remove(2);

  const account = await fetchJellybeanMachineWithItems(
    sellerUmi,
    jellybeanMachine
  );
  t.is(account.itemsLoaded, 2);

  await claim(0);
  await claim(1);
  t.pass();
});

test('the close flow claims every prize, removes back to front and withdraws', async (t) => {
  const { sellerUmi, jellybeanMachine, claim, remove } =
    await createSoldOutMachine();

  await claim(0);
  await claim(1);
  await claim(2);

  await remove(2);
  await remove(1);
  await remove(0);

  await closeJellybeanMachine(sellerUmi, { jellybeanMachine }).sendAndConfirm(
    sellerUmi
  );

  t.false(await sellerUmi.rpc.accountExists(jellybeanMachine));
});
