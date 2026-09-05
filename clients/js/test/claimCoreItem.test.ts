import { fetchAsset } from '@metaplex-foundation/mpl-core';
import { generateKeyPairSigner } from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import test from 'ava';
import { JellybeanState } from '../src';
import {
  claimCoreItem,
  create,
  createClient,
  createCoreAsset,
  createMasterEdition,
  DEFAULT_MAX_SUPPLY,
  defaultAssetData,
  draw,
  fetchJellybeanMachineWithItems,
  fetchUnclaimedPrizesFromSeeds,
  generateKeyPairSignerWithSol,
  getBalance,
  sameAddress,
  safeFetchUnclaimedPrizesFromSeeds,
  sendTransaction,
} from './_setup';

test('it can claim an edition', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer.address,
  });
  const drawnEditionNumber = unclaimedPrizes.prizes[0].editionNumber;

  const printAsset = await generateKeyPairSigner();
  await claimCoreItem(client, {
    jellybeanMachine,
    buyer: buyer.address,
    payer: buyer,
    collection: collection.publicKey,
    index: 0,
    printAsset,
  });

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(client.svm, {
      jellybeanMachine,
      buyer: buyer.address,
    })
  );

  t.like(fetchJellybeanMachineWithItems(client.svm, jellybeanMachine), {
    itemsLoaded: 1,
    supplyLoaded: BigInt(DEFAULT_MAX_SUPPLY),
    supplyRedeemed: 1n,
    state: JellybeanState.SaleLive,
    items: [
      {
        index: 0,
        mint: collection.publicKey,
        supplyLoaded: DEFAULT_MAX_SUPPLY,
        supplyRedeemed: 1,
      },
    ],
  });

  const printedAsset = await fetchAsset(client.umi, printAsset.address);
  const assetData = defaultAssetData();
  t.like(printedAsset, {
    name: assetData.name,
    uri: assetData.uri,
    owner: buyer.address,
    updateAuthority: { type: 'Collection', address: collection.publicKey },
    edition: { number: drawnEditionNumber },
  });
});

test('it can claim a one of one asset', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  await claimCoreItem(client, {
    jellybeanMachine,
    buyer: buyer.address,
    payer: buyer,
    asset: asset.publicKey,
    index: 0,
  });

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(client.svm, {
      jellybeanMachine,
      buyer: buyer.address,
    })
  );

  t.like(fetchJellybeanMachineWithItems(client.svm, jellybeanMachine), {
    itemsLoaded: 1,
    supplyLoaded: 1n,
    supplyRedeemed: 1n,
    state: JellybeanState.SaleEnded,
    items: [
      {
        index: 0,
        mint: asset.publicKey,
        supplyLoaded: 1,
        supplyRedeemed: 1,
      },
    ],
  });

  const claimedAsset = await fetchAsset(client.umi, asset.publicKey);
  const assetData = defaultAssetData();
  t.like(claimedAsset, {
    name: assetData.name,
    uri: assetData.uri,
    owner: buyer.address,
    updateAuthority: { type: 'Address', address: client.payer.address },
  });
});

test('it can claim a one of one asset in a collection', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi, { plugins: [] });
  const asset = await createCoreAsset(client.umi, { collection });
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey, collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  await claimCoreItem(client, {
    jellybeanMachine,
    buyer: buyer.address,
    payer: buyer,
    asset: asset.publicKey,
    collection: collection.publicKey,
    index: 0,
  });

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(client.svm, {
      jellybeanMachine,
      buyer: buyer.address,
    })
  );

  const claimedAsset = await fetchAsset(client.umi, asset.publicKey);
  const assetData = defaultAssetData();
  t.like(claimedAsset, {
    name: assetData.name,
    uri: assetData.uri,
    owner: buyer.address,
    updateAuthority: { type: 'Collection', address: collection.publicKey },
  });
});

test('it can claim an edition with a different payer', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  const thirdPartyPayer = await generateKeyPairSignerWithSol(client.svm);
  const printAsset = await generateKeyPairSigner();
  const beforeBalance = getBalance(client.svm, thirdPartyPayer.address);

  await claimCoreItem(client, {
    jellybeanMachine,
    buyer: buyer.address,
    payer: thirdPartyPayer,
    collection: collection.publicKey,
    index: 0,
    printAsset,
  });

  const afterBalance = getBalance(client.svm, thirdPartyPayer.address);
  // Should only charge the tx fee as payer gets escrowed funds back.
  t.is(afterBalance, beforeBalance - 10_000n);

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(client.svm, {
      jellybeanMachine,
      buyer: buyer.address,
    })
  );

  t.like(fetchJellybeanMachineWithItems(client.svm, jellybeanMachine), {
    itemsLoaded: 1,
    supplyLoaded: BigInt(DEFAULT_MAX_SUPPLY),
    supplyRedeemed: 1n,
    state: JellybeanState.SaleLive,
    items: [
      {
        index: 0,
        mint: collection.publicKey,
        supplyLoaded: DEFAULT_MAX_SUPPLY,
        supplyRedeemed: 1,
        escrowAmount: 3427920n,
      },
    ],
  });

  const printedAsset = await fetchAsset(client.umi, printAsset.address);
  t.like(printedAsset, {
    owner: buyer.address,
    updateAuthority: { type: 'Collection', address: collection.publicKey },
    edition: { number: 1 },
  });
});

test('it fails if the item index is invalid', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  const printAsset = await generateKeyPairSigner();
  await t.throwsAsync(
    () =>
      claimCoreItem(client, {
        jellybeanMachine,
        buyer: buyer.address,
        payer: buyer,
        collection: collection.publicKey,
        index: 1, // Invalid index.
        printAsset,
      }),
    { message: /InvalidItemIndex/ }
  );
});

test('it fails to claim an edition if the print asset is missing', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  await t.throwsAsync(
    () =>
      claimCoreItem(client, {
        jellybeanMachine,
        buyer: buyer.address,
        payer: buyer,
        collection: collection.publicKey,
        index: 0,
        // printAsset is missing
      }),
    { message: /MissingPrintAsset/ }
  );
});

test('it fails if the prize has already been claimed', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  const printAsset = await generateKeyPairSigner();
  await claimCoreItem(client, {
    jellybeanMachine,
    buyer: buyer.address,
    payer: buyer,
    collection: collection.publicKey,
    index: 0,
    printAsset,
  });

  await t.throwsAsync(
    () =>
      claimCoreItem(client, {
        jellybeanMachine,
        buyer: buyer.address,
        payer: buyer,
        collection: collection.publicKey,
        index: 0,
        printAsset,
      }),
    { message: /AccountNotInitialized/ }
  );
});

test('it fails if the buyer is invalid', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer1 = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer: buyer1 });

  const buyer2 = await generateKeyPairSignerWithSol(client.svm);
  const printAsset = await generateKeyPairSigner();
  await t.throwsAsync(
    () =>
      claimCoreItem(client, {
        jellybeanMachine,
        buyer: buyer2.address,
        payer: buyer2,
        collection: collection.publicKey,
        index: 0,
        printAsset,
      }),
    { message: /AccountNotInitialized./ }
  );
});

test('it can claim then draw then claim again', async (t) => {
  const client = await createClient();
  const assets = await Promise.all([
    createCoreAsset(client.umi),
    createCoreAsset(client.umi),
  ]);
  const jellybeanMachine = await create(client, {
    items: [{ asset: assets[0].publicKey }, { asset: assets[1].publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  let unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer.address,
  });
  let drawnPrize = unclaimedPrizes.prizes[0];
  await claimCoreItem(client, {
    jellybeanMachine,
    buyer: buyer.address,
    payer: buyer,
    asset: assets[drawnPrize.itemIndex].publicKey,
    index: drawnPrize.itemIndex,
  });

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(client.svm, {
      jellybeanMachine,
      buyer: buyer.address,
    })
  );

  await draw(client, { jellybeanMachine, buyer });
  unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer.address,
  });
  drawnPrize = unclaimedPrizes.prizes[0];
  await claimCoreItem(client, {
    jellybeanMachine,
    buyer: buyer.address,
    payer: buyer,
    asset: assets[drawnPrize.itemIndex].publicKey,
    index: drawnPrize.itemIndex,
  });

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(client.svm, {
      jellybeanMachine,
      buyer: buyer.address,
    })
  );

  t.like(fetchJellybeanMachineWithItems(client.svm, jellybeanMachine), {
    itemsLoaded: 2,
    supplyLoaded: 2n,
    supplyRedeemed: 2n,
    state: JellybeanState.SaleEnded,
  });
});

test('it reallocates the unclaimed prizes account when it is not empty', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi, { maxSupply: 2 });
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });
  await draw(client, { jellybeanMachine, buyer });

  const printAsset = await generateKeyPairSigner();
  const preBalance = getBalance(client.svm, buyer.address);
  await claimCoreItem(client, {
    jellybeanMachine,
    buyer: buyer.address,
    payer: buyer,
    collection: collection.publicKey,
    index: 0,
    printAsset,
  });
  const postBalance = getBalance(client.svm, buyer.address);
  t.true(postBalance > preBalance);

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer.address,
  });
  t.like(unclaimedPrizes, {
    prizes: [{ itemIndex: 0, editionNumber: 2 }],
  });

  t.like(fetchJellybeanMachineWithItems(client.svm, jellybeanMachine), {
    itemsLoaded: 1,
    supplyLoaded: 2n,
    supplyRedeemed: 2n,
    state: JellybeanState.SaleEnded,
    items: [
      {
        index: 0,
        mint: collection.publicKey,
        supplyLoaded: 2,
        supplyRedeemed: 2,
      },
    ],
  });
});

test('it refunds rent to payer when buyer account is closed (single claim)', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  // Drain the buyer's remaining balance so it can't pay rent.
  const remaining = getBalance(client.svm, buyer.address);
  if (remaining > 5000n) {
    await sendTransaction(client.svm, buyer, [
      getTransferSolInstruction({
        source: buyer,
        destination: client.payer.address,
        amount: remaining - 5000n,
      }),
    ]);
  }
  t.true(getBalance(client.svm, buyer.address) < 10_000n);

  // Claim with the seller as payer; rent refund goes to the payer, not buyer.
  await claimCoreItem(client, {
    jellybeanMachine,
    buyer: buyer.address,
    payer: client.payer,
    asset: asset.publicKey,
    index: 0,
  });

  t.falsy(
    await safeFetchUnclaimedPrizesFromSeeds(client.svm, {
      jellybeanMachine,
      buyer: buyer.address,
    })
  );
  const claimedAsset = await fetchAsset(client.umi, asset.publicKey);
  t.true(sameAddress(claimedAsset.owner, buyer.address));
});

test('it refunds excess rent to payer when buyer account is closed (partial claim)', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi, { maxSupply: 2 });
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });
  await draw(client, { jellybeanMachine, buyer });

  let unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer.address,
  });
  t.is(unclaimedPrizes.prizes.length, 2);

  const remaining = getBalance(client.svm, buyer.address);
  if (remaining > 5000n) {
    await sendTransaction(client.svm, buyer, [
      getTransferSolInstruction({
        source: buyer,
        destination: client.payer.address,
        amount: remaining - 5000n,
      }),
    ]);
  }
  t.true(getBalance(client.svm, buyer.address) < 10_000n);

  const printAsset = await generateKeyPairSigner();
  await claimCoreItem(client, {
    jellybeanMachine,
    buyer: buyer.address,
    payer: client.payer,
    collection: collection.publicKey,
    index: 0,
    printAsset,
  });

  unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer.address,
  });
  t.is(unclaimedPrizes.prizes.length, 1);

  const printedAsset = await fetchAsset(client.umi, printAsset.address);
  t.true(sameAddress(printedAsset.owner, buyer.address));
});
