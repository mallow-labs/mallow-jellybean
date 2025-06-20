import { AssetV1, fetchAssetV1 } from '@metaplex-foundation/mpl-core';
import {
  fetchToken,
  findAssociatedTokenPda,
  TokenState,
} from '@metaplex-foundation/mpl-toolbox';
import { some, transactionBuilder } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  approveAddItem,
  fetchGumballMachine,
  fetchSellerHistoryFromSeeds,
  findGumballMachineAuthorityPda,
  GumballMachine,
  requestAddCoreAsset,
  requestAddNft,
  safeFetchAddItemRequestFromSeeds,
  SellerHistory,
  startSale,
  TokenStandard,
} from '../src';
import { create, createCoreAsset, createNft, createUmi } from './_setup';

test('it can approve a request to add core asset to a gumball machine', async (t) => {
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

  // Then accept the request
  await transactionBuilder()
    .add(
      approveAddItem(umi, {
        gumballMachine: gumballMachine.publicKey,
        seller: sellerUmi.identity.publicKey,
        asset: coreAsset.publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Then the request is closed
  const addItemRequestAccount = await safeFetchAddItemRequestFromSeeds(umi, {
    asset: coreAsset.publicKey,
  });
  t.falsy(addItemRequestAccount);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 1,
    items: [
      {
        index: 0,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: coreAsset.publicKey,
        seller: sellerUmi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.Core,
        amount: 1,
      },
    ],
  });

  // Then the asset is still frozen/delegated to the gumball machine
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

test('it can approve a request to add an nft to a gumball machine', async (t) => {
  // Given a Gumball Machine with 5 core assets.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });

  const sellerUmi = await createUmi();
  const nft = await createNft(sellerUmi);

  // When we create a request to add an nft to the Gumball Machine.
  await transactionBuilder()
    .add(
      requestAddNft(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
      })
    )
    .sendAndConfirm(sellerUmi);

  // Then accept the request
  await transactionBuilder()
    .add(
      approveAddItem(umi, {
        gumballMachine: gumballMachine.publicKey,
        seller: sellerUmi.identity.publicKey,
        asset: nft.publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Then the request is closed
  const addItemRequestAccount = await safeFetchAddItemRequestFromSeeds(umi, {
    asset: nft.publicKey,
  });
  t.falsy(addItemRequestAccount);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 1,
    items: [
      {
        index: 0,
        isDrawn: false,
        isClaimed: false,
        isSettled: false,
        mint: nft.publicKey,
        seller: sellerUmi.identity.publicKey,
        buyer: undefined,
        tokenStandard: TokenStandard.NonFungible,
        amount: 1,
      },
    ],
  });

  // Then the nft is still frozen/delegated to the gumball machine
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: sellerUmi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Frozen,
    owner: sellerUmi.identity.publicKey,
    delegate: some(
      findGumballMachineAuthorityPda(umi, {
        gumballMachine: gumballMachine.publicKey,
      })[0]
    ),
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

test('it cannot approve a request to add core asset to a gumball machine after the gumball has started', async (t) => {
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
  });

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

  // Then the sale starts
  await startSale(umi, {
    gumballMachine: gumballMachine.publicKey,
  }).sendAndConfirm(umi);

  // Then accepting the request fails
  const promise = transactionBuilder()
    .add(
      approveAddItem(umi, {
        gumballMachine: gumballMachine.publicKey,
        seller: sellerUmi.identity.publicKey,
        asset: coreAsset.publicKey,
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /InvalidState/ });
});
