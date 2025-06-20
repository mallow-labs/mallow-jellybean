import { AssetV1, fetchAssetV1 } from '@metaplex-foundation/mpl-core';
import { transactionBuilder } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  cancelAddCoreAssetRequest,
  deleteGumballMachine,
  findGumballMachineAuthorityPda,
  findSellerHistoryPda,
  requestAddCoreAsset,
  safeFetchAddItemRequestFromSeeds,
  safeFetchSellerHistoryFromSeeds,
} from '../src';
import { create, createCoreAsset, createUmi } from './_setup';

test('it can cancel a request to add core asset to a gumball machine', async (t) => {
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

  // Then cancel the request to add an coreAsset to the Gumball Machine.
  await transactionBuilder()
    .add(
      cancelAddCoreAssetRequest(sellerUmi, {
        asset: coreAsset.publicKey,
        sellerHistory: findSellerHistoryPda(umi, {
          gumballMachine: gumballMachine.publicKey,
          seller: sellerUmi.identity.publicKey,
        }),
        authorityPda: findGumballMachineAuthorityPda(umi, {
          gumballMachine: gumballMachine.publicKey,
        }),
      })
    )
    .sendAndConfirm(sellerUmi);

  // Then the request is closed
  const addItemRequestAccount = await safeFetchAddItemRequestFromSeeds(umi, {
    asset: coreAsset.publicKey,
  });

  t.falsy(addItemRequestAccount);

  // Then nft is unfrozen and revoked
  const asset = await fetchAssetV1(umi, coreAsset.publicKey);
  t.like(asset, <AssetV1>{
    freezeDelegate: undefined,
    transferDelegate: undefined,
    owner: sellerUmi.identity.publicKey,
  });

  // Seller history state is closed
  const sellerHistoryAccount = await safeFetchSellerHistoryFromSeeds(umi, {
    gumballMachine: gumballMachine.publicKey,
    seller: sellerUmi.identity.publicKey,
  });

  t.falsy(sellerHistoryAccount);
});

test('it can cancel a request to add core asset to a gumball machine after the gumball has closed', async (t) => {
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

  // Then delete the gumball machine.
  await transactionBuilder()
    .add(
      deleteGumballMachine(umi, { gumballMachine: gumballMachine.publicKey })
    )
    .sendAndConfirm(umi);

  // Then cancel the request to add an coreAsset to the Gumball Machine.
  await transactionBuilder()
    .add(
      cancelAddCoreAssetRequest(sellerUmi, {
        asset: coreAsset.publicKey,
        sellerHistory: findSellerHistoryPda(umi, {
          gumballMachine: gumballMachine.publicKey,
          seller: sellerUmi.identity.publicKey,
        }),
        authorityPda: findGumballMachineAuthorityPda(umi, {
          gumballMachine: gumballMachine.publicKey,
        }),
      })
    )
    .sendAndConfirm(sellerUmi);

  // Then the request is closed
  const addItemRequestAccount = await safeFetchAddItemRequestFromSeeds(umi, {
    asset: coreAsset.publicKey,
  });

  t.falsy(addItemRequestAccount);

  // Then nft is unfrozen and revoked
  const asset = await fetchAssetV1(umi, coreAsset.publicKey);
  t.like(asset, <AssetV1>{
    freezeDelegate: undefined,
    transferDelegate: undefined,
    owner: sellerUmi.identity.publicKey,
  });

  // Seller history state is closed
  const sellerHistoryAccount = await safeFetchSellerHistoryFromSeeds(umi, {
    gumballMachine: gumballMachine.publicKey,
    seller: sellerUmi.identity.publicKey,
  });

  t.falsy(sellerHistoryAccount);
});
