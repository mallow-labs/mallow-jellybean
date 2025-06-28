import { drawJellybean } from '@mallow-labs/mallow-gumball';
import { AssetV1, fetchAsset } from '@metaplex-foundation/mpl-core';
import { generateSigner, some } from '@metaplex-foundation/umi';
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

  let updatedUnclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });
  const drawnEditionNumber = updatedUnclaimedPrizes.prizes[0].editionNumber;

  const printAsset = generateSigner(buyerUmi);
  await claimCoreItem(buyerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
    collection: collectionSigner.publicKey,
    index: 0,
    printAsset,
  }).sendAndConfirm(buyerUmi);

  updatedUnclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(sellerUmi, {
    jellybeanMachine,
    buyer: buyer.publicKey,
  });
  t.is(updatedUnclaimedPrizes.prizes.length, 0);

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

  const updatedUnclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(
    sellerUmi,
    {
      jellybeanMachine,
      buyer: buyer.publicKey,
    }
  );
  t.is(updatedUnclaimedPrizes.prizes.length, 0);

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

  const updatedUnclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(
    sellerUmi,
    {
      jellybeanMachine,
      buyer: buyer.publicKey,
    }
  );
  t.is(updatedUnclaimedPrizes.prizes.length, 0);

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
    { message: /InvalidItemIndex/ }
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
