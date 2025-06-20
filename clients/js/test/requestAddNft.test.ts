import {
  fetchToken,
  findAssociatedTokenPda,
  TokenState,
} from '@metaplex-foundation/mpl-toolbox';
import { some, transactionBuilder } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  AddItemRequest,
  fetchAddItemRequestFromSeeds,
  fetchSellerHistory,
  findGumballMachineAuthorityPda,
  findSellerHistoryPda,
  MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
  requestAddCoreAsset,
  requestAddNft,
  SellerHistory,
  TokenStandard,
} from '../src';
import { create, createNft, createProgrammableNft, createUmi } from './_setup';

test('it can create a request to add nft to a gumball machine', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });

  const sellerUmi = await createUmi();
  const nft = await createNft(sellerUmi);

  // When we add an nft to the Gumball Machine.
  await transactionBuilder()
    .add(
      requestAddNft(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
      })
    )
    .sendAndConfirm(umi);

  // Then the request is created properly.
  const addItemRequestAccount = await fetchAddItemRequestFromSeeds(umi, {
    asset: nft.publicKey,
  });

  t.like(addItemRequestAccount, <AddItemRequest>{
    asset: nft.publicKey,
    seller: sellerUmi.identity.publicKey,
    gumballMachine: gumballMachine.publicKey,
    tokenStandard: TokenStandard.NonFungible,
  });

  // Then nft is frozen and delegated
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(sellerUmi, {
      mint: nft.publicKey,
      owner: sellerUmi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Frozen,
    owner: sellerUmi.identity.publicKey,
    delegate: some(
      findGumballMachineAuthorityPda(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
      })[0]
    ),
  });

  // Seller history state is correct
  const sellerHistoryAccount = await fetchSellerHistory(
    sellerUmi,
    findSellerHistoryPda(sellerUmi, {
      gumballMachine: gumballMachine.publicKey,
      seller: sellerUmi.identity.publicKey,
    })[0]
  );

  t.like(sellerHistoryAccount, <SellerHistory>{
    gumballMachine: gumballMachine.publicKey,
    seller: sellerUmi.identity.publicKey,
    itemCount: 1n,
  });
});

test('it can create a request to add pnft to a gumball machine', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });

  const sellerUmi = await createUmi();
  const nft = await createProgrammableNft(sellerUmi);

  // When we add an nft to the Gumball Machine.
  await transactionBuilder()
    .add(
      requestAddNft(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
        authRulesProgram: MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
      })
    )
    .sendAndConfirm(umi);

  // Then the request is created properly.
  const addItemRequestAccount = await fetchAddItemRequestFromSeeds(umi, {
    asset: nft.publicKey,
  });

  t.like(addItemRequestAccount, <AddItemRequest>{
    asset: nft.publicKey,
    seller: sellerUmi.identity.publicKey,
    gumballMachine: gumballMachine.publicKey,
    tokenStandard: TokenStandard.ProgrammableNonFungible,
  });

  // Then nft is frozen and delegated
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(sellerUmi, {
      mint: nft.publicKey,
      owner: sellerUmi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Frozen,
    owner: sellerUmi.identity.publicKey,
    delegate: some(
      findGumballMachineAuthorityPda(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
      })[0]
    ),
  });

  // Seller history state is correct
  const sellerHistoryAccount = await fetchSellerHistory(
    sellerUmi,
    findSellerHistoryPda(sellerUmi, {
      gumballMachine: gumballMachine.publicKey,
      seller: sellerUmi.identity.publicKey,
    })[0]
  );

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
  const nft = await createNft(umi);

  // When we create a request to add an coreAsset to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      requestAddCoreAsset(umi, {
        gumballMachine: gumballMachine.publicKey,
        asset: nft.publicKey,
      })
    )
    .sendAndConfirm(umi);

  await t.throwsAsync(promise, { message: /SellerCannotBeAuthority/ });
});

test('it cannot request to add nft when limit has been reached', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const gumballMachine = await create(umi, {
    settings: { itemCapacity: 5, itemsPerSeller: 1 },
  });

  const sellerUmi = await createUmi();
  let nft = await createNft(sellerUmi);

  await transactionBuilder()
    .add(
      requestAddNft(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
      })
    )
    .sendAndConfirm(sellerUmi);

  nft = await createNft(sellerUmi);

  // When we create a request to add an nft to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      requestAddNft(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
      })
    )
    .sendAndConfirm(sellerUmi);

  await t.throwsAsync(promise, { message: /SellerTooManyItems/ });
});

test('it cannot request to add nft when sale has started', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const initialNft = await createNft(umi);

  const gumballMachine = await create(umi, {
    settings: {
      itemCapacity: 5,
    },
    items: [
      {
        id: initialNft.publicKey,
        tokenStandard: TokenStandard.NonFungible,
      },
    ],
    startSale: true,
  });

  const sellerUmi = await createUmi();
  const nft = await createNft(sellerUmi);

  // When we create a request to add an nft to the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      requestAddNft(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
      })
    )
    .sendAndConfirm(sellerUmi);

  await t.throwsAsync(promise, { message: /InvalidState/ });
});
