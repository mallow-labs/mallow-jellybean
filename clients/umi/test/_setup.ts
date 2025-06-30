import {
  createGumballGuard as baseCreateGumballGuard,
  CreateGumballGuardInstructionDataArgs,
  DefaultGuardSetArgs,
  drawJellybean,
  findGumballGuardPda,
  GuardSetArgs,
  GumballGuardDataArgs,
  InitializeGumballGuardInstructionAccounts,
  wrap,
} from '@mallow-labs/mallow-gumball';
import {
  create as baseCreateCoreAsset,
  createCollection,
  ruleSet,
} from '@metaplex-foundation/mpl-core';
import {
  createAssociatedToken,
  createMint,
  findAssociatedTokenPda,
  mintTokensTo,
  setComputeUnitLimit,
} from '@metaplex-foundation/mpl-toolbox';
import {
  DateTime,
  generateSigner,
  now,
  percentAmount,
  PublicKey,
  publicKey,
  PublicKeyInput,
  Signer,
  signerIdentity,
  sol,
  transactionBuilder,
  TransactionSignature,
  Umi,
} from '@metaplex-foundation/umi';
import { createUmi as basecreateUmi } from '@metaplex-foundation/umi-bundle-tests';
import { Assertions } from 'ava';
import {
  addCoreItem,
  createJellybeanMachine,
  FeeAccount,
  fetchUnclaimedPrizesFromSeeds,
  initialize,
  mallowJellybean,
  Prize,
  startSale,
} from '../src';

export const DEFAULT_MAX_SUPPLY = 100;
export const DEFAULT_MARKETPLACE_FEE_BASIS_POINTS = 500;
export const DEFAULT_SOL_PAYMENT_LAMPORTS = sol(0.1);

export const getDefaultFeeAccounts = (
  authority: PublicKey,
  marketplaceFeeAccount?: PublicKey
): FeeAccount[] =>
  marketplaceFeeAccount
    ? [
        {
          address: marketplaceFeeAccount,
          basisPoints: DEFAULT_MARKETPLACE_FEE_BASIS_POINTS, // 5%
        },
        {
          address: authority,
          basisPoints: 10000 - DEFAULT_MARKETPLACE_FEE_BASIS_POINTS, // 95%
        },
      ]
    : [
        {
          address: authority,
          basisPoints: 10000, // 100%
        },
      ];

export const createUmi = async (signer?: Signer) => {
  const umi = (await basecreateUmi()).use(mallowJellybean());
  if (signer) {
    umi.use(signerIdentity(signer));
  }
  return umi;
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

export const createMasterEdition = async (
  umi: Umi,
  input: Partial<Parameters<typeof createCollection>[1]> & {
    maxSupply?: number | undefined;
  } = {
    maxSupply: DEFAULT_MAX_SUPPLY,
  }
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
      {
        type: 'MasterEdition',
        maxSupply: input.maxSupply,
      },
    ],
    ...input,
  }).sendAndConfirm(umi);

  return collection;
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
  input: Omit<Partial<Parameters<typeof initialize>[1]>, 'jellybeanMachine'> & {
    jellybeanMachine?: Signer;
    items?: {
      asset?: PublicKey;
      collection?: PublicKey;
    }[];
    startSale?: boolean;
  } & Partial<
      GumballGuardDataArgs<DA extends undefined ? DefaultGuardSetArgs : DA>
    > = {}
) => {
  const jellybeanMachineSigner = input.jellybeanMachine ?? generateSigner(umi);
  const jellybeanMachine = jellybeanMachineSigner.publicKey;

  let builder = transactionBuilder().add(
    await createJellybeanMachine(umi, {
      ...input,
      jellybeanMachine: jellybeanMachineSigner,
      args: {
        feeAccounts:
          input.args?.feeAccounts ??
          getDefaultFeeAccounts(umi.identity.publicKey),
        uri: input.args?.uri ?? 'https://example.com/jellybean-machine.json',
      },
    })
  );

  const guards = input.guards ?? {
    solPayment: {
      lamports: DEFAULT_SOL_PAYMENT_LAMPORTS,
    },
  };

  if (Object.keys(guards).length > 0 || input.groups !== undefined) {
    const gumballGuard = findGumballGuardPda(umi, {
      base: jellybeanMachine,
    });
    builder = builder
      .add(
        baseCreateGumballGuard<DA>(umi, {
          ...input,
          base: jellybeanMachineSigner,
        })
      )
      .add(
        wrap(umi, {
          machine: jellybeanMachine,
          gumballGuard,
          machineProgram: umi.programs.get('mallowJellybean').publicKey,
        })
      );
  }

  (input.items ?? []).forEach((item) => {
    builder = builder.add(
      addCoreItem(umi, {
        jellybeanMachine,
        ...item,
      })
    );
  });

  if (input.startSale) {
    builder = builder.add(
      startSale(umi, {
        jellybeanMachine,
      })
    );
  }

  await builder.sendAndConfirm(umi);

  return jellybeanMachine;
};

export const defaultAssetData = () => ({
  name: 'My Asset',
  sellerFeeBasisPoints: percentAmount(10, 2),
  uri: 'https://example.com/my-asset.json',
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

export const yesterday = (): DateTime => now() - 3600n * 24n;
export const tomorrow = (): DateTime => now() + 3600n * 24n;

export const drawRemainingItems = async (
  umi: Umi,
  jellybeanMachine: PublicKey,
  available: number,
  batchSizeSetting: number = 10
) => {
  const prizes: Prize[] = [];
  for (let i = 0; i < available; i += batchSizeSetting) {
    const buyer = generateSigner(umi);
    const batchSize = Math.min(batchSizeSetting, available - i);

    let builder = transactionBuilder().add(
      setComputeUnitLimit(umi, { units: 1_400_000 })
    );

    // Add all draws to the same transaction
    for (let j = 0; j < batchSize; j += 1) {
      builder = builder.add(
        drawJellybean(umi, {
          jellybeanMachine,
        })
      );
    }

    await builder.sendAndConfirm(umi);

    // Fetch the machine once after the batch completes
    const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(umi, {
      jellybeanMachine,
      buyer: buyer.publicKey,
    });
    prizes.push(...unclaimedPrizes.prizes);
  }

  return prizes;
};
