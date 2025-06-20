import { AssetV1, fetchAssetV1 } from '@metaplex-foundation/mpl-core';
import { transactionBuilder } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  AddItemRequest,
  fetchAddItemRequestFromSeeds,
  fetchSellerHistoryFromSeeds,
  findGumballMachineAuthorityPda,
  requestAddCoreAsset,
  SellerHistory,
  TokenStandard,
} from '../src';
import { create, createCoreAsset, createUmi } from './_setup';

test('it can create a request to add core asset to a gumball machine', async (t) => {
  // Given a Gumball Machine with 5 core assets.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });

  const sellerUmi = await createUmi();
  const coreAsset = await createCoreAsset(sellerUmi);

  // When we create a request to add an coreAsset to the Gumball Machine.
  await transactionBuilder()
    .add(
      requestAddCoreAsset(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        asset: coreAsset.publicKey,
      })
    )
    .sendAndConfirm(sellerUmi);

  // Then the request is created properly.
  const addItemRequestAccount = await fetchAddItemRequestFromSeeds(umi, {
    asset: coreAsset.publicKey,
  });

  t.like(addItemRequestAccount, <AddItemRequest>{
    asset: coreAsset.publicKey,
    seller: sellerUmi.identity.publicKey,
    gumballMachine: gumballMachine.publicKey,
    tokenStandard: TokenStandard.Core,
  });

  const asset = await fetchAssetV1(umi, coreAsset.publicKey);
  t.like(asset, <AssetV1>{
    owner: sellerUmi.identity.publicKey,
    transferDelegate: {
      authority: {
        type: 'Address',
        address: findGumballMachineAuthorityPda(umi, {
          gumballMachine: gumballMachine.publicKey,
        })[0],
      },
    },
    freezeDelegate: {
      authority: {
        type: 'Address',
        address: findGumballMachineAuthorityPda(umi, {
          gumballMachine: gumballMachine.publicKey,
        })[0],
      },
      frozen: true,
    },
  });

  // Seller history state is correct
  const sellerHistoryAccount = await fetchSellerHistoryFromSeeds(umi, {
    gumballMachine: gumballMachine.publicKey,
    seller: sellerUmi.identity.publicKey,
  });

  t.like(sellerHistoryAccount, <SellerHistory>{
    gumballMachine: gumballMachine.publicKey,
    seller: sellerUmi.identity.publicKey,
    itemCount: 1n,
  });
});

test('it cannot request to add core asset as the gumball machine authority', async (t) => {
  // Given a Gumball Machine with 5 core assets.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });
  const coreAsset = await createCoreAsset(umi);

  // When we create a request to add an coreAsset to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      requestAddCoreAsset(umi, {
        gumballMachine: gumballMachine.publicKey,
        asset: coreAsset.publicKey,
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /SellerCannotBeAuthority/ });
});

test('it cannot request to add core asset when limit has been reached', async (t) => {
  // Given a Gumball Machine with 5 core assets.
  const umi = await createUmi();
  const gumballMachine = await create(umi, {
    settings: { itemCapacity: 5, itemsPerSeller: 1 },
  });

  const sellerUmi = await createUmi();
  let coreAsset = await createCoreAsset(sellerUmi);

  await transactionBuilder()
    .add(
      requestAddCoreAsset(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        asset: coreAsset.publicKey,
      })
    )
    .sendAndConfirm(sellerUmi);

  coreAsset = await createCoreAsset(sellerUmi);
  // When we create a request to add an coreAsset to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      requestAddCoreAsset(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        asset: coreAsset.publicKey,
      })
    )
    .sendAndConfirm(sellerUmi);

  await t.throwsAsync(promise, { message: /SellerTooManyItems/ });
});

test('it cannot request to add core asset when sale has started', async (t) => {
  // Given a Gumball Machine with 5 core assets.
  const umi = await createUmi();
  const asset = await createCoreAsset(umi);

  const gumballMachine = await create(umi, {
    settings: {
      itemCapacity: 5,
    },
    items: [
      {
        id: asset.publicKey,
        tokenStandard: TokenStandard.Core,
      },
    ],
    startSale: true,
  });

  const sellerUmi = await createUmi();
  const coreAsset = await createCoreAsset(sellerUmi);

  // When we create a request to add an coreAsset to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      requestAddCoreAsset(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        asset: coreAsset.publicKey,
      })
    )
    .sendAndConfirm(sellerUmi);

  await t.throwsAsync(promise, { message: /InvalidState/ });
});
