import { drawJellybean } from '@mallow-labs/mallow-gumball';
import {
  generateSigner,
  keypairIdentity,
  KeypairSigner,
  sol,
  some,
  Umi,
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
} from './_setup';

let sellerUmi: Umi;
let payer: KeypairSigner;

test.beforeEach(async () => {
  sellerUmi = await createUmi();
  payer = await generateSignerWithSol(sellerUmi);
  sellerUmi.use(keypairIdentity(payer));
});

test('it can claim an edition', async (t) => {
  const collectionSigner = await createMasterEdition(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        collection: collectionSigner.publicKey,
      },
    ],
    startSale: true,
    guards: {
      solPayment: {
        lamports: sol(0.1),
      },
    },
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
