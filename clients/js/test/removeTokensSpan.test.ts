import {
  fetchToken,
  findAssociatedTokenPda,
  setComputeUnitLimit,
  TokenState,
} from '@metaplex-foundation/mpl-toolbox';
import {
  generateSigner,
  none,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import test from 'ava';
import {
  addTokens,
  fetchGumballMachine,
  fetchSellerHistory,
  findGumballMachineAuthorityPda,
  findSellerHistoryPda,
  getMerkleProof,
  getMerkleRoot,
  GumballMachine,
  removeTokensSpan,
  safeFetchSellerHistory,
  SellerHistory,
  TokenStandard,
} from '../src';
import { create, createMintWithHolders, createUmi } from './_setup';

test('it can remove tokens from a gumball machine', async (t) => {
  // Given a Gumball Machine with 5 tokens.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });

  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  // When we add a token prize to the Gumball Machine.
  await transactionBuilder()
    .add(
      addTokens(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint.publicKey,
        amount: 100,
        quantity: 1,
      })
    )
    .sendAndConfirm(umi);

  // Then remove the tokens
  await transactionBuilder()
    .add(
      removeTokensSpan(umi, {
        gumballMachine: gumballMachine.publicKey,
        startIndex: 0,
        endIndex: 0,
        mint: tokenMint.publicKey,
        amount: 100,
      })
    )
    .sendAndConfirm(umi);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 0,
    items: [],
  });

  // Then seller's token account is filled
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 100n,
  });

  // Then authority pda's token account is closed
  const authorityPda = findGumballMachineAuthorityPda(umi, {
    gumballMachine: gumballMachine.publicKey,
  })[0];
  const authorityTokenAccountExists = await umi.rpc.accountExists(
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: authorityPda,
    })[0]
  );
  t.falsy(authorityTokenAccountExists);

  // Seller history should no longer exist
  const sellerHistoryAccount = await safeFetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine: gumballMachine.publicKey,
      seller: umi.identity.publicKey,
    })[0]
  );

  t.falsy(sellerHistoryAccount);
});

test('it can remove tokens at a lower index than last from a gumball machine', async (t) => {
  // Given a Gumball Machine with 5 tokens.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });
  const [tokenMint1, tokenMint2] = await Promise.all([
    createMintWithHolders(umi, {
      holders: [{ owner: umi.identity, amount: 100 }],
    }),
    createMintWithHolders(umi, {
      holders: [{ owner: umi.identity, amount: 100 }],
    }),
  ]);

  // When we add two tokens to the Gumball Machine.
  await transactionBuilder()
    .add(
      addTokens(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint1[0].publicKey,
        amount: 100,
        quantity: 1,
      })
    )
    .add(
      addTokens(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint2[0].publicKey,
        amount: 100,
        quantity: 1,
      })
    )
    .sendAndConfirm(umi);

  // Then remove the tokens
  await transactionBuilder()
    .add(
      removeTokensSpan(umi, {
        gumballMachine: gumballMachine.publicKey,
        startIndex: 0,
        endIndex: 0,
        mint: tokenMint1[0].publicKey,
        amount: 100,
      })
    )
    .sendAndConfirm(umi);

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
        mint: tokenMint2[0].publicKey,
        seller: umi.identity.publicKey,
        buyer: undefined,
        amount: 100,
        tokenStandard: TokenStandard.Fungible,
      },
    ],
  });

  // Then token account is filled
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint1[0].publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 100n,
  });
});

test('it can remove additional tokens from a gumball machine', async (t) => {
  // Given a Gumball Machine with 2 tokens.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 2 } });
  const [tokenMint1, tokenMint2] = await Promise.all([
    createMintWithHolders(umi, {
      holders: [{ owner: umi.identity, amount: 100 }],
    }),
    createMintWithHolders(umi, {
      holders: [{ owner: umi.identity, amount: 100 }],
    }),
  ]);

  await transactionBuilder()
    .add(
      addTokens(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint1[0].publicKey,
        amount: 100,
        quantity: 1,
      })
    )
    .add(
      addTokens(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint2[0].publicKey,
        amount: 100,
        quantity: 1,
      })
    )
    .sendAndConfirm(umi);

  // When we remove an additional item from the Gumball Machine.
  await transactionBuilder()
    .add(
      removeTokensSpan(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint1[0].publicKey,
        startIndex: 0,
        endIndex: 0,
        amount: 100,
      })
    )
    .sendAndConfirm(umi);

  // Seller history should exist with one item
  const sellerHistoryAccount = await fetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine: gumballMachine.publicKey,
      seller: umi.identity.publicKey,
    })[0]
  );

  t.like(sellerHistoryAccount, <SellerHistory>{
    gumballMachine: gumballMachine.publicKey,
    seller: umi.identity.publicKey,
    itemCount: 1n,
  });

  // When we remove an additional item from the Gumball Machine.
  await transactionBuilder()
    .add(
      removeTokensSpan(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint2[0].publicKey,
        startIndex: 0,
        endIndex: 0,
        amount: 100,
      })
    )
    .sendAndConfirm(umi);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 0,
    items: [],
  });
});

test('it cannot remove tokens when the machine is empty', async (t) => {
  // Given an existing Gumball Machine with a capacity of 1 item.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 1 } });
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  // When we try to remove tokens from the Gumball Machine.
  const promise = transactionBuilder()
    .add(
      removeTokensSpan(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint.publicKey,
        startIndex: 0,
        endIndex: 0,
        amount: 100,
      })
    )
    .sendAndConfirm(umi);

  // Then we expect an error to be thrown.
  await t.throwsAsync(promise, {
    message: /AccountNotInitialized/,
  });
});

test('it cannot remove tokens as a different seller', async (t) => {
  // Given a Gumball Machine with 1 token.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 1 } });
  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  // When we add tokens to the Gumball Machine.
  await transactionBuilder()
    .add(
      addTokens(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint.publicKey,
        amount: 100,
        quantity: 1,
      })
    )
    .sendAndConfirm(umi);

  // Then remove the tokens as a different authority
  const promise = transactionBuilder()
    .add(
      removeTokensSpan(umi, {
        authority: generateSigner(umi),
        gumballMachine: gumballMachine.publicKey,
        startIndex: 0,
        endIndex: 0,
        mint: tokenMint.publicKey,
        amount: 100,
      })
    )
    .sendAndConfirm(umi);

  // Then an error is thrown.
  await t.throwsAsync(promise, { message: /InvalidAuthority/ });
});

test('it can remove another seller tokens as the gumball authority', async (t) => {
  // Given a Gumball Machine with one token.
  const umi = await createUmi();
  const otherSellerUmi = await createUmi();
  const sellersMerkleRoot = getMerkleRoot([otherSellerUmi.identity.publicKey]);
  const gumballMachine = await create(umi, {
    settings: { itemCapacity: 1, sellersMerkleRoot },
  });
  const [tokenMint] = await createMintWithHolders(otherSellerUmi, {
    holders: [{ owner: otherSellerUmi.identity, amount: 100 }],
  });

  // When we add tokens to the Gumball Machine.
  await transactionBuilder()
    .add(
      addTokens(otherSellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint.publicKey,
        amount: 100,
        quantity: 1,
        args: {
          sellerProofPath: getMerkleProof(
            [otherSellerUmi.identity.publicKey],
            otherSellerUmi.identity.publicKey
          ),
        },
      })
    )
    .sendAndConfirm(otherSellerUmi);

  // Then remove the tokens as the gumball machine authority
  await transactionBuilder()
    .add(
      removeTokensSpan(umi, {
        gumballMachine: gumballMachine.publicKey,
        startIndex: 0,
        endIndex: 0,
        mint: tokenMint.publicKey,
        amount: 100,
        seller: otherSellerUmi.identity.publicKey,
        tokenAccount: findAssociatedTokenPda(umi, {
          mint: tokenMint.publicKey,
          owner: otherSellerUmi.identity.publicKey,
        })[0],
      })
    )
    .sendAndConfirm(umi);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 0,
    items: [],
  });

  // Then token account is filled
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: otherSellerUmi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: otherSellerUmi.identity.publicKey,
    delegate: none(),
    amount: 100n,
  });
});

test('it can remove own tokens as non gumball authority', async (t) => {
  // Given a Gumball Machine with one token.
  const umi = await createUmi();
  const otherSellerUmi = await createUmi();
  const sellersMerkleRoot = getMerkleRoot([otherSellerUmi.identity.publicKey]);
  const gumballMachine = await create(umi, {
    settings: { itemCapacity: 1, sellersMerkleRoot },
  });
  const [tokenMint] = await createMintWithHolders(otherSellerUmi, {
    holders: [{ owner: otherSellerUmi.identity, amount: 100 }],
  });

  // When we add tokens to the Gumball Machine.
  await transactionBuilder()
    .add(
      addTokens(otherSellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint.publicKey,
        amount: 100,
        quantity: 1,
        args: {
          sellerProofPath: getMerkleProof(
            [otherSellerUmi.identity.publicKey],
            otherSellerUmi.identity.publicKey
          ),
        },
      })
    )
    .sendAndConfirm(otherSellerUmi);

  // Then remove the tokens as the seller
  await transactionBuilder()
    .add(
      removeTokensSpan(otherSellerUmi, {
        gumballMachine: gumballMachine.publicKey,
        startIndex: 0,
        endIndex: 0,
        mint: tokenMint.publicKey,
        amount: 100,
      })
    )
    .sendAndConfirm(otherSellerUmi);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded' | 'items'>>{
    itemsLoaded: 0,
    items: [],
  });

  // Then token account is filled
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: otherSellerUmi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: otherSellerUmi.identity.publicKey,
    delegate: none(),
    amount: 100n,
  });
});

test('it does not close the authority pda token account when there are tokens remaining', async (t) => {
  // Given a Gumball Machine with 5 tokens.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 5 } });

  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 200 }], // Increased amount to add multiple tokens
  });

  // When we add two token prizes to the Gumball Machine.
  await transactionBuilder()
    .add(
      addTokens(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint.publicKey,
        amount: 100,
        quantity: 2, // Add 2 tokens instead of 1
      })
    )
    .sendAndConfirm(umi);

  // Then remove one of the tokens
  await transactionBuilder()
    .add(
      removeTokensSpan(umi, {
        gumballMachine: gumballMachine.publicKey,
        startIndex: 0,
        endIndex: 0,
        mint: tokenMint.publicKey,
        amount: 100,
      })
    )
    .sendAndConfirm(umi);

  // Then the Gumball Machine still has one token
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
        mint: tokenMint.publicKey,
        seller: umi.identity.publicKey,
        buyer: undefined,
        amount: 100,
        tokenStandard: TokenStandard.Fungible,
      },
    ],
  });

  // Then seller's token account is filled with the removed token
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 100n,
  });

  // Then authority pda's token account should still exist and hold the remaining token
  const authorityPda = findGumballMachineAuthorityPda(umi, {
    gumballMachine: gumballMachine.publicKey,
  })[0];
  const authorityTokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: authorityPda,
    })[0]
  );
  t.like(authorityTokenAccount, {
    state: TokenState.Initialized,
    amount: 100n,
  });

  // Seller history should still exist with one item
  const sellerHistoryAccount = await fetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine: gumballMachine.publicKey,
      seller: umi.identity.publicKey,
    })[0]
  );

  t.like(sellerHistoryAccount, <SellerHistory>{
    gumballMachine: gumballMachine.publicKey,
    seller: umi.identity.publicKey,
    itemCount: 1n,
  });
});

test('it cannot remove one of another token amount from a gumball machine', async (t) => {
  // Given a Gumball Machine with 50 tokens.
  const umi = await createUmi();
  const gumballMachine = await create(umi, { settings: { itemCapacity: 100 } });

  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 100 }],
  });

  // When we add a token prize to the Gumball Machine.
  await transactionBuilder()
    .add(
      addTokens(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint.publicKey,
        amount: 10,
        quantity: 1,
      })
    )
    .add(
      addTokens(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint.publicKey,
        amount: 20,
        quantity: 1,
      })
    )
    .sendAndConfirm(umi);

  // Then remove the tokens
  const promise = transactionBuilder()
    .add(
      removeTokensSpan(umi, {
        gumballMachine: gumballMachine.publicKey,
        startIndex: 0,
        endIndex: 1,
        mint: tokenMint.publicKey,
        amount: 10,
      })
    )
    .sendAndConfirm(umi);

  // Then an error is thrown.
  await t.throwsAsync(promise, { message: /InvalidAmount/ });
});

test('it can remove 1000 tokens at once from a gumball machine', async (t) => {
  // Given a Gumball Machine with 1000 tokens.
  const umi = await createUmi();
  const gumballMachine = await create(umi, {
    settings: { itemCapacity: 1000 },
  });

  const [tokenMint] = await createMintWithHolders(umi, {
    holders: [{ owner: umi.identity, amount: 1000 }],
  });

  // When we add a token prize to the Gumball Machine.
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 1_400_000 }))
    .add(
      addTokens(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint.publicKey,
        amount: 1,
        quantity: 1000,
      })
    )
    .sendAndConfirm(umi);

  // Then remove the tokens
  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 1_400_000 }))
    .add(
      removeTokensSpan(umi, {
        gumballMachine: gumballMachine.publicKey,
        mint: tokenMint.publicKey,
        amount: 1,
        startIndex: 0,
        endIndex: 999,
      })
    )
    .sendAndConfirm(umi);

  // Then the Gumball Machine has been updated properly.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );

  t.like(gumballMachineAccount, <Pick<GumballMachine, 'itemsLoaded'>>{
    itemsLoaded: 0,
  });

  // Then seller's token account is filled
  const tokenAccount = await fetchToken(
    umi,
    findAssociatedTokenPda(umi, {
      mint: tokenMint.publicKey,
      owner: umi.identity.publicKey,
    })[0]
  );
  t.like(tokenAccount, {
    state: TokenState.Initialized,
    owner: umi.identity.publicKey,
    delegate: none(),
    amount: 1000n,
  });

  // Seller history should exist
  const sellerHistoryAccount = await safeFetchSellerHistory(
    umi,
    findSellerHistoryPda(umi, {
      gumballMachine: gumballMachine.publicKey,
      seller: umi.identity.publicKey,
    })[0]
  );

  t.falsy(sellerHistoryAccount);
});
