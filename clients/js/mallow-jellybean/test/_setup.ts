/* eslint-disable import/no-extraneous-dependencies */
import {
  create as baseCreateCoreAsset,
  createCollection,
  ruleSet,
} from '@metaplex-foundation/mpl-core';
import {
  createNft as baseCreateNft,
  createProgrammableNft as baseCreateProgrammableNft,
  DigitalAssetWithToken,
  fetchDigitalAssetWithAssociatedToken,
  findMasterEditionPda,
  findMetadataPda,
  TokenStandard as MplTokenStandard,
  verifyCollectionV1,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  createAssociatedToken,
  createMint,
  findAssociatedTokenPda,
  mintTokensTo,
  setComputeUnitLimit,
} from '@metaplex-foundation/mpl-toolbox';
import {
  assertAccountExists,
  DateTime,
  generateSigner,
  none,
  now,
  percentAmount,
  PublicKey,
  publicKey,
  PublicKeyInput,
  Signer,
  some,
  transactionBuilder,
  TransactionSignature,
  Umi,
} from '@metaplex-foundation/umi';
import { createUmi as basecreateUmi } from '@metaplex-foundation/umi-bundle-tests';
import { Keypair } from '@solana/web3.js';
import { Assertions } from 'ava';
import {
  addCoreAsset,
  addNft,
  addTokens,
  createGumballGuard as baseCreateGumballGuard,
  createGumballMachine as baseCreateGumballMachineV2,
  ConfigLineInput,
  CreateGumballGuardInstructionDataArgs,
  DefaultGuardSetArgs,
  draw,
  fetchGumballMachine,
  findGumballGuardPda,
  GuardSetArgs,
  GumballGuardDataArgs,
  GumballSettings,
  GumballSettingsArgs,
  InitializeGumballGuardInstructionAccounts,
  mallowGumball,
  MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
  startSale,
  TokenStandard,
  wrap,
} from '../src';

export const METAPLEX_DEFAULT_RULESET = publicKey(
  'eBJLFYPxJmMGKuFwpDWkzxZeUrad92kZRC5BJLpzyT9'
);

export const createUmi = async () =>
  (await basecreateUmi()).use(mallowGumball());

export const createNft = async (
  umi: Umi,
  input: Partial<Parameters<typeof baseCreateNft>[1]> = {}
): Promise<Signer> => {
  const mint = generateSigner(umi);
  await baseCreateNft(umi, {
    mint,
    ...defaultAssetData(),
    ...input,
  }).sendAndConfirm(umi);

  return mint;
};

export const createCoreAsset = async (
  umi: Umi,
  input: Partial<Parameters<typeof baseCreateCoreAsset>[1]> = {}
): Promise<Signer> => {
  const asset = generateSigner(umi);
  const defaultData = defaultAssetData();

  await baseCreateCoreAsset(umi, {
    asset,
    ...defaultData,
    plugins: [
      {
        type: 'Royalties',
        basisPoints: 1000,
        creators: [
          {
            address: umi.identity.publicKey,
            percentage: 100,
          },
        ],
        ruleSet: ruleSet('None'),
      },
    ],
    ...input,
  }).sendAndConfirm(umi);

  return asset;
};

export const createCoreCollection = async (
  umi: Umi,
  input: Partial<Parameters<typeof createCollection>[1]> = {}
): Promise<Signer> => {
  const collection = generateSigner(umi);
  const defaultData = defaultAssetData();

  await createCollection(umi, {
    collection,
    ...defaultData,
    plugins: [
      {
        type: 'Royalties',
        basisPoints: 1000,
        creators: [
          {
            address: umi.identity.publicKey,
            percentage: 100,
          },
        ],
        ruleSet: ruleSet('None'),
      },
    ],
    ...input,
  }).sendAndConfirm(umi);

  return collection;
};

export const createProgrammableNft = async (
  umi: Umi,
  input: Partial<Parameters<typeof baseCreateProgrammableNft>[1]> = {},
  options: {
    withAuthRules?: boolean;
  } = {}
): Promise<Signer> => {
  const mint = generateSigner(umi);
  await baseCreateProgrammableNft(umi, {
    mint,
    ...defaultAssetData(),
    ...input,
    ruleSet: options.withAuthRules
      ? publicKey('eBJLFYPxJmMGKuFwpDWkzxZeUrad92kZRC5BJLpzyT9')
      : undefined,
  }).sendAndConfirm(umi);

  return mint;
};

export const createCollectionNft = async (
  umi: Umi,
  input: Partial<Parameters<typeof baseCreateNft>[1]> = {}
): Promise<Signer> => createNft(umi, { ...input, isCollection: true });

export const createVerifiedNft = async (
  umi: Umi,
  input: Partial<Parameters<typeof baseCreateNft>[1]> & {
    collectionMint: PublicKey;
    collectionAuthority?: Signer;
  }
): Promise<Signer> => {
  const { collectionMint, collectionAuthority = umi.identity, ...rest } = input;
  const mint = await createNft(umi, {
    ...rest,
    collection: some({ verified: false, key: collectionMint }),
  });
  const effectiveMint = publicKey(rest.mint ?? mint.publicKey);

  await transactionBuilder()
    .add(
      verifyCollectionV1(umi, {
        authority: collectionAuthority,
        collectionMint,
        metadata: findMetadataPda(umi, { mint: effectiveMint })[0],
      })
    )
    .sendAndConfirm(umi);

  return mint;
};

export const createVerifiedProgrammableNft = async (
  umi: Umi,
  input: Partial<Parameters<typeof baseCreateNft>[1]> & {
    collectionMint: PublicKey;
    collectionAuthority?: Signer;
  }
): Promise<Signer> => {
  const { collectionMint, collectionAuthority = umi.identity, ...rest } = input;
  const mint = await createProgrammableNft(umi, {
    ...rest,
    collection: some({ verified: false, key: collectionMint }),
  });
  const effectiveMint = publicKey(rest.mint ?? mint.publicKey);

  await transactionBuilder()
    .add(
      verifyCollectionV1(umi, {
        authority: collectionAuthority,
        collectionMint,
        metadata: findMetadataPda(umi, { mint: effectiveMint })[0],
      })
    )
    .sendAndConfirm(umi);

  return mint;
};

export const createMintWithHolders = async (
  umi: Umi,
  input: Partial<Omit<Parameters<typeof createMint>[1], 'mintAuthority'>> & {
    mintAuthority?: Signer;
    holders: { owner: PublicKeyInput; amount: number | bigint }[];
  }
): Promise<[Signer, ...PublicKey[]]> => {
  const atas = [] as PublicKey[];
  const mint = input.mint ?? generateSigner(umi);
  const mintAuthority = input.mintAuthority ?? umi.identity;
  let builder = transactionBuilder().add(
    createMint(umi, {
      ...input,
      mint,
      mintAuthority: mintAuthority.publicKey,
    })
  );
  input.holders.forEach((holder) => {
    const owner = publicKey(holder.owner);
    const [token] = findAssociatedTokenPda(umi, {
      mint: mint.publicKey,
      owner,
    });
    atas.push(token);
    builder = builder.add(
      createAssociatedToken(umi, { mint: mint.publicKey, owner })
    );
    if (holder.amount > 0) {
      builder = builder.add(
        mintTokensTo(umi, {
          mint: mint.publicKey,
          token,
          amount: holder.amount,
          mintAuthority,
        })
      );
    }
  });
  await builder.sendAndConfirm(umi);

  return [mint, ...atas];
};

export const create = async <DA extends GuardSetArgs = DefaultGuardSetArgs>(
  umi: Umi,
  input: Omit<
    Partial<Parameters<typeof baseCreateGumballMachineV2>[1]>,
    'settings'
  > & {
    settings?: Partial<GumballSettingsArgs>;
    items?: {
      id: PublicKey;
      tokenStandard: TokenStandard;
      amount?: number;
      quantity?: number;
    }[];
    startSale?: boolean;
  } & Partial<
      GumballGuardDataArgs<DA extends undefined ? DefaultGuardSetArgs : DA>
    > = {}
) => {
  const gumballMachine = input.gumballMachine ?? generateSigner(umi);
  let builder = await baseCreateGumballMachineV2(umi, {
    ...input,
    settings: {
      ...defaultGumballSettings(),
      ...input.settings,
    },
    gumballMachine,
  });

  if (input.guards !== undefined || input.groups !== undefined) {
    const gumballGuard = findGumballGuardPda(umi, {
      base: gumballMachine.publicKey,
    });
    builder = builder
      .add(baseCreateGumballGuard<DA>(umi, { ...input, base: gumballMachine }))
      .add(
        wrap(umi, {
          gumballMachine: gumballMachine.publicKey,
          gumballGuard,
        })
      );
  }

  (input.items ?? []).forEach((item) => {
    if (
      item.tokenStandard === TokenStandard.NonFungible ||
      item.tokenStandard === TokenStandard.ProgrammableNonFungible
    ) {
      builder = builder.add(
        addNft(umi, {
          gumballMachine: gumballMachine.publicKey,
          mint: item.id,
          authRulesProgram:
            item.tokenStandard === TokenStandard.ProgrammableNonFungible
              ? MPL_TOKEN_AUTH_RULES_PROGRAM_ID
              : undefined,
        })
      );
    } else if (item.tokenStandard === TokenStandard.Fungible) {
      builder = builder.add(
        addTokens(umi, {
          gumballMachine: gumballMachine.publicKey,
          mint: item.id,
          amount: item.amount ?? 1,
          quantity: item.quantity ?? 1,
        })
      );
    } else {
      builder = builder.add(
        addCoreAsset(umi, {
          gumballMachine: gumballMachine.publicKey,
          asset: item.id,
        })
      );
    }
  });

  if (input.startSale) {
    builder = builder.add(
      startSale(umi, {
        gumballMachine: gumballMachine.publicKey,
      })
    );
  }

  await builder.sendAndConfirm(umi);
  return gumballMachine;
};

export const defaultAssetData = () => ({
  name: 'My Asset',
  sellerFeeBasisPoints: percentAmount(10, 2),
  uri: 'https://example.com/my-asset.json',
});

export const defaultGumballSettings = (): GumballSettings => ({
  itemCapacity: 100n,
  uri: 'https://example.com/gumball-machine.json',
  itemsPerSeller: 3,
  sellersMerkleRoot: none(),
  curatorFeeBps: 500,
  hideSoldItems: false,
  paymentMint: publicKey('So11111111111111111111111111111111111111112'),
});

export const createGumballGuard = async <
  DA extends GuardSetArgs = DefaultGuardSetArgs,
>(
  umi: Umi,
  input: Partial<
    InitializeGumballGuardInstructionAccounts &
      CreateGumballGuardInstructionDataArgs<
        DA extends undefined ? DefaultGuardSetArgs : DA
      >
  > = {}
) => {
  const base = input.base ?? generateSigner(umi);
  await transactionBuilder()
    .add(baseCreateGumballGuard<DA>(umi, { ...input, base }))
    .sendAndConfirm(umi);

  return findGumballGuardPda(umi, { base: base.publicKey });
};

export const assertSuccessfulMint = async (
  t: Assertions,
  umi: Umi,
  input: {
    mint: PublicKey | Signer;
    owner: PublicKey | Signer;
    token?: PublicKey;
    tokenStandard?: MplTokenStandard;
    name?: string | RegExp;
    uri?: string | RegExp;
  }
) => {
  const mint = publicKey(input.mint);
  const owner = publicKey(input.owner);
  const {
    token = findAssociatedTokenPda(umi, { mint, owner }),
    tokenStandard,
    name,
    uri,
  } = input;

  // Nft.
  const nft = await fetchDigitalAssetWithAssociatedToken(umi, mint, owner);
  t.like(nft, <DigitalAssetWithToken>{
    publicKey: publicKey(mint),
    mint: {
      publicKey: publicKey(mint),
      supply: 1n,
    },
    token: {
      publicKey: publicKey(token),
      mint: publicKey(mint),
      owner: publicKey(owner),
      amount: 1n,
    },
    edition: {
      isOriginal: true,
    },
    metadata: {
      tokenStandard: { __option: 'Some' },
      primarySaleHappened: true,
    },
  });

  // Token Stardard.
  if (tokenStandard !== undefined) {
    t.deepEqual(nft.metadata.tokenStandard, some(tokenStandard));
  }

  // Name.
  if (typeof name === 'string') t.is(nft.metadata.name, name);
  else if (name !== undefined) t.regex(nft.metadata.name, name);

  // Uri.
  if (typeof uri === 'string') t.is(nft.metadata.uri, uri);
  else if (uri !== undefined) t.regex(nft.metadata.uri, uri);
};

export const assertItemBought = async (
  t: Assertions,
  umi: Umi,
  input: {
    gumballMachine: PublicKey;
    buyer?: PublicKey;
    count?: number;
  }
) => {
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    input.gumballMachine
  );

  const buyerCount = gumballMachineAccount.items.filter(
    (item) => item.buyer === (input.buyer ?? umi.identity.publicKey)
  ).length;

  t.is(buyerCount, input.count ?? 1);
};

export const assertBotTax = async (
  t: Assertions,
  umi: Umi,
  signature: TransactionSignature,
  extraRegex?: RegExp
) => {
  const transaction = await umi.rpc.getTransaction(signature);
  t.true(transaction !== null);
  const logs = transaction!.meta.logs.join('');
  t.regex(logs, /Gumball Guard Botting is taxed/);
  if (extraRegex !== undefined) t.regex(logs, extraRegex);
};

export const assertBurnedNft = async (
  t: Assertions,
  umi: Umi,
  mint: Signer | PublicKey,
  owner?: Signer | PublicKey
) => {
  owner = owner ?? umi.identity;
  const [tokenAccount] = findAssociatedTokenPda(umi, {
    mint: publicKey(mint),
    owner: publicKey(owner),
  });
  const [metadataAccount] = findMetadataPda(umi, { mint: publicKey(mint) });
  const [editionAccount] = findMasterEditionPda(umi, { mint: publicKey(mint) });

  const metadata = await umi.rpc.getAccount(metadataAccount);
  // Metadata accounts is not closed since it contains fees but
  // the data length should be 1.
  t.true(metadata.exists);
  assertAccountExists(metadata);
  t.true(metadata.data.length === 1);

  t.false(await umi.rpc.accountExists(tokenAccount));
  t.false(await umi.rpc.accountExists(editionAccount));
};

export const yesterday = (): DateTime => now() - 3600n * 24n;
export const tomorrow = (): DateTime => now() + 3600n * 24n;

export const getNewConfigLine = async (
  umi: Umi,
  overrides?: Partial<ConfigLineInput>
): Promise<ConfigLineInput> => ({
  mint: (await createNft(umi)).publicKey,
  seller: publicKey(Keypair.generate().publicKey),
  ...overrides,
});

export const drawRemainingItems = async (
  umi: Umi,
  gumballMachine: PublicKey,
  available: number,
  batchSizeSetting: number = 10
) => {
  const indices: number[] = [];
  for (let i = 0; i < available; i += batchSizeSetting) {
    const buyer = generateSigner(umi);
    const batchSize = Math.min(batchSizeSetting, available - i);

    let builder = transactionBuilder().add(
      setComputeUnitLimit(umi, { units: 1_400_000 })
    );

    // Add all draws to the same transaction
    for (let j = 0; j < batchSize; j += 1) {
      builder = builder.add(
        draw(umi, {
          gumballMachine,
          buyer,
        })
      );
    }

    await builder.sendAndConfirm(umi);

    // Fetch the machine once after the batch completes
    const gumballMachineAccount = await fetchGumballMachine(
      umi,
      gumballMachine
    );
    const buyerItems = gumballMachineAccount.items.filter(
      (item) => item.buyer === buyer.publicKey
    );
    indices.push(...buyerItems.map((item) => item.index));
  }

  return indices;
};
