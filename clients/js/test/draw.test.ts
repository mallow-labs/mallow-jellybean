import { generateKeyPairSigner } from '@solana/kit';
import test from 'ava';
import { JellybeanState } from '../src';
import {
  create,
  createClient,
  createCoreAsset,
  createMasterEdition,
  DEFAULT_MAX_SUPPLY,
  draw,
  endSale,
  fetchJellybeanMachineWithItems,
  fetchUnclaimedPrizesFromSeeds,
  generateKeyPairSignerWithSol,
  getBalance,
} from './_setup';

test('it can draw an item from a master edition', async (t) => {
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
  t.is(unclaimedPrizes.prizes.length, 1);
  t.is(unclaimedPrizes.prizes[0].itemIndex, 0);
  t.is(unclaimedPrizes.prizes[0].editionNumber, 1);
  t.is(unclaimedPrizes.jellybeanMachine, jellybeanMachine);
  t.is(unclaimedPrizes.buyer, buyer.address);

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
});

test('it can draw a one-of-one asset', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer.address,
  });
  t.is(unclaimedPrizes.prizes.length, 1);
  t.is(unclaimedPrizes.prizes[0].itemIndex, 0);
  t.is(unclaimedPrizes.prizes[0].editionNumber, 1);

  t.like(fetchJellybeanMachineWithItems(client.svm, jellybeanMachine), {
    itemsLoaded: 1,
    supplyLoaded: 1n,
    supplyRedeemed: 1n,
    state: JellybeanState.SaleEnded, // ends after drawing the only item
    items: [
      {
        index: 0,
        mint: asset.publicKey,
        supplyLoaded: 1,
        supplyRedeemed: 1,
      },
    ],
  });
});

test('it can draw multiple items from multiple collections', async (t) => {
  const client = await createClient();
  const collection1 = await createMasterEdition(client.umi, { maxSupply: 50 });
  const collection2 = await createMasterEdition(client.umi, { maxSupply: 30 });
  const jellybeanMachine = await create(client, {
    items: [
      { collection: collection1.publicKey },
      { collection: collection2.publicKey },
    ],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  for (let i = 0; i < 5; i++) {
    await draw(client, { jellybeanMachine, buyer });
  }

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer.address,
  });
  t.is(unclaimedPrizes.prizes.length, 5);
  unclaimedPrizes.prizes.forEach((prize) => {
    t.true(prize.itemIndex >= 0 && prize.itemIndex <= 1);
    t.true(prize.editionNumber >= 1);
  });

  const account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.supplyRedeemed, 5n);
  t.is(account.state, JellybeanState.SaleLive);
});

test('it can draw items from mixed asset types', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi, { maxSupply: 10 });
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }, { asset: asset.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  for (let i = 0; i < 3; i++) {
    await draw(client, { jellybeanMachine, buyer });
  }

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer.address,
  });
  t.is(unclaimedPrizes.prizes.length, 3);
  t.is(
    fetchJellybeanMachineWithItems(client.svm, jellybeanMachine).supplyRedeemed,
    3n
  );
});

test('it fails to draw when jellybean machine is empty', async (t) => {
  const client = await createClient();
  const asset = await createCoreAsset(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ asset: asset.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer });

  await t.throwsAsync(() => draw(client, { jellybeanMachine, buyer }), {
    message: /InvalidState/,
  });
});

test('it fails to draw when sale is not live', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: false,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await t.throwsAsync(() => draw(client, { jellybeanMachine, buyer }), {
    message: /InvalidState/,
  });
});

test('it fails to draw when sale has ended', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });
  await endSale(client, jellybeanMachine);

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await t.throwsAsync(() => draw(client, { jellybeanMachine, buyer }), {
    message: /InvalidState/,
  });
});

test('it initializes unclaimed prizes account on first draw', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);

  await t.throwsAsync(
    () =>
      fetchUnclaimedPrizesFromSeeds(client.svm, {
        jellybeanMachine,
        buyer: buyer.address,
      }),
    { message: /The account of type \[UnclaimedPrizes\] was not found/ }
  );

  await draw(client, { jellybeanMachine, buyer });

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer.address,
  });
  t.like(unclaimedPrizes, {
    version: 0,
    jellybeanMachine,
    buyer: buyer.address,
  });
  t.is(unclaimedPrizes.prizes.length, 1);
});

test('it handles multiple buyers drawing from the same machine', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer1 = await generateKeyPairSignerWithSol(client.svm);
  const buyer2 = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, { jellybeanMachine, buyer: buyer1 });
  await draw(client, { jellybeanMachine, buyer: buyer2 });

  const buyer1Prizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer1.address,
  });
  const buyer2Prizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer2.address,
  });

  t.is(buyer1Prizes.prizes.length, 1);
  t.is(buyer2Prizes.prizes.length, 1);
  t.is(buyer1Prizes.buyer, buyer1.address);
  t.is(buyer2Prizes.buyer, buyer2.address);
  t.not(
    buyer1Prizes.prizes[0].editionNumber,
    buyer2Prizes.prizes[0].editionNumber
  );

  t.is(
    fetchJellybeanMachineWithItems(client.svm, jellybeanMachine).supplyRedeemed,
    2n
  );
});

test('it can draw all items from a master edition', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi, { maxSupply: 3 });
  const jellybeanMachine = await create(client, {
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  for (let i = 0; i < 3; i++) {
    await draw(client, { jellybeanMachine, buyer });
  }

  const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(client.svm, {
    jellybeanMachine,
    buyer: buyer.address,
  });
  t.is(unclaimedPrizes.prizes.length, 3);
  const editionNumbers = unclaimedPrizes.prizes
    .map((p) => p.editionNumber)
    .sort();
  t.deepEqual(editionNumbers, [1, 2, 3]);

  const account = fetchJellybeanMachineWithItems(client.svm, jellybeanMachine);
  t.is(account.supplyRedeemed, 3n);
  t.is(account.state, JellybeanState.SaleEnded);

  await t.throwsAsync(() => draw(client, { jellybeanMachine, buyer }), {
    message: /InvalidState/,
  });
});

test('it transfers print fee to the correct account', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const feeAccount = await generateKeyPairSigner();

  const jellybeanMachine = await create(client, {
    feeAccounts: [{ address: client.payer.address, basisPoints: 10000 }],
    uri: 'https://example.com',
    printFeeConfig: {
      address: feeAccount.address,
      amount: 11_000_000,
    },
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await draw(client, {
    jellybeanMachine,
    buyer,
    printFeeAccount: feeAccount.address,
  });

  t.is(getBalance(client.svm, feeAccount.address), 11_000_000n);
});

test('it fails when providing the wrong print fee account', async (t) => {
  const client = await createClient();
  const collection = await createMasterEdition(client.umi);
  const feeAccount = await generateKeyPairSigner();

  const jellybeanMachine = await create(client, {
    feeAccounts: [{ address: client.payer.address, basisPoints: 10000 }],
    uri: 'https://example.com',
    printFeeConfig: {
      address: feeAccount.address,
      amount: 11_000_000,
    },
    items: [{ collection: collection.publicKey }],
    startSale: true,
  });

  const buyer = await generateKeyPairSignerWithSol(client.svm);
  await t.throwsAsync(
    () =>
      draw(client, {
        jellybeanMachine,
        buyer,
        printFeeAccount: client.payer.address,
      }),
    { message: /Invalid print fee account/ }
  );
});
