import {
  fetchToken,
  findAssociatedTokenPda,
  TokenState,
} from '@metaplex-foundation/mpl-toolbox';
import { none, transactionBuilder } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  cancelAddNftRequest,
  deleteGumballMachine,
  findGumballMachineAuthorityPda,
  findSellerHistoryPda,
  MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
  requestAddNft,
  safeFetchAddItemRequestFromSeeds,
  safeFetchSellerHistory,
} from '../src';
import { create, createNft, createProgrammableNft, createUmi } from './_setup';

test('it can cancel a request to add an nft to a gumball machine', async (t) => {
  // Given a Gumball Machine with 5 nfts.
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
    .sendAndConfirm(umi);

  // Then cancel the request to add an coreAsset to the Gumball Machine.
  await transactionBuilder()
    .add(
      cancelAddNftRequest(sellerUmi, {
        mint: nft.publicKey,
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
    asset: nft.publicKey,
  });

  t.falsy(addItemRequestAccount);

  // Then nft is unfrozen and revoked
  const tokenAccount = await fetchToken(
    sellerUmi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: sellerUmi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: sellerUmi.identity.publicKey,
    delegate: none(),
  });

  // Seller history should no longer exist
  const sellerHistoryAccount = await safeFetchSellerHistory(
    sellerUmi,
    findSellerHistoryPda(sellerUmi, {
      gumballMachine: gumballMachine.publicKey,
      seller: sellerUmi.identity.publicKey,
    })[0]
  );

  t.falsy(sellerHistoryAccount);
});

test('it can cancel a request to add a pnft to a gumball machine', async (t) => {
  // Given a Gumball Machine with 5 nfts.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });

  const sellerUmi = await createUmi();
  const nft = await createProgrammableNft(sellerUmi);

  // When we create a request to add an nft to the Gumball Machine.
  await transactionBuilder()
    .add(
      requestAddNft(sellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: nft.publicKey,
        authRulesProgram: MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
      })
    )
    .sendAndConfirm(umi);

  // Then cancel the request to add an coreAsset to the Gumball Machine.
  await transactionBuilder()
    .add(
      cancelAddNftRequest(sellerUmi, {
        mint: nft.publicKey,
        sellerHistory: findSellerHistoryPda(umi, {
          gumballMachine: gumballMachine.publicKey,
          seller: sellerUmi.identity.publicKey,
        }),
        authorityPda: findGumballMachineAuthorityPda(umi, {
          gumballMachine: gumballMachine.publicKey,
        }),
        authRulesProgram: MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
      })
    )
    .sendAndConfirm(sellerUmi);

  // Then the request is closed
  const addItemRequestAccount = await safeFetchAddItemRequestFromSeeds(umi, {
    asset: nft.publicKey,
  });

  t.falsy(addItemRequestAccount);

  // Then nft is unfrozen and revoked
  const tokenAccount = await fetchToken(
    sellerUmi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: sellerUmi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Frozen,
    owner: sellerUmi.identity.publicKey,
    delegate: none(),
  });

  // Seller history should no longer exist
  const sellerHistoryAccount = await safeFetchSellerHistory(
    sellerUmi,
    findSellerHistoryPda(sellerUmi, {
      gumballMachine: gumballMachine.publicKey,
      seller: sellerUmi.identity.publicKey,
    })[0]
  );

  t.falsy(sellerHistoryAccount);
});

test('it can cancel a request to add an nft to a gumball machine after the gumball has closed', async (t) => {
  // Given a Gumball Machine with 5 nfts.
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
    .sendAndConfirm(umi);

  // Then delete the gumball machine.
  await transactionBuilder()
    .add(
      deleteGumballMachine(umi, { gumballMachine: gumballMachine.publicKey })
    )
    .sendAndConfirm(umi);

  // Then cancel the request to add an coreAsset to the Gumball Machine.
  await transactionBuilder()
    .add(
      cancelAddNftRequest(sellerUmi, {
        mint: nft.publicKey,
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
    asset: nft.publicKey,
  });

  t.falsy(addItemRequestAccount);

  // Then nft is unfrozen and revoked
  const tokenAccount = await fetchToken(
    sellerUmi,
    findAssociatedTokenPda(umi, {
      mint: nft.publicKey,
      owner: sellerUmi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: sellerUmi.identity.publicKey,
    delegate: none(),
  });

  // Seller history should no longer exist
  const sellerHistoryAccount = await safeFetchSellerHistory(
    sellerUmi,
    findSellerHistoryPda(sellerUmi, {
      gumballMachine: gumballMachine.publicKey,
      seller: sellerUmi.identity.publicKey,
    })[0]
  );

  t.falsy(sellerHistoryAccount);
});
