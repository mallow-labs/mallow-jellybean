import {
  create as baseCreateCoreAsset,
  createCollection,
  ruleSet,
} from '@metaplex-foundation/mpl-core';
import {
  generateSigner,
  percentAmount,
  type PublicKey,
  type Signer,
  type Umi,
} from '@metaplex-foundation/umi';
import {
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  generateKeyPairSigner,
  getAddressDecoder,
  getArrayDecoder,
  getStructDecoder,
  getU32Decoder,
  getU64Decoder,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Blockhash,
  type Instruction,
  type TransactionSigner,
} from '@solana/kit';
import { getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import { getCreateAccountInstruction } from '@solana-program/system';
import {
  FailedTransactionMetadata,
  type LiteSVM,
  type TransactionMetadata,
} from 'litesvm';
import {
  decodeJellybeanMachine,
  decodeUnclaimedPrizes,
  findUnclaimedPrizesPda,
  getAddCoreItemInstructionAsync,
  getClaimCoreItemInstructionAsync,
  getDrawInstructionAsync,
  getEndSaleInstruction,
  getInitializeInstructionAsync,
  getRemoveCoreItemInstructionAsync,
  getStartSaleInstruction,
  getWithdrawInstruction,
  MALLOW_JELLYBEAN_PROGRAM_ADDRESS,
  type FeeAccountArgs,
  type JellybeanMachine,
  type SettingsArgsArgs,
  type UnclaimedPrizes,
} from '../src';
import { createSvm } from './litesvm/svm';
import { createUmiForSvm } from './litesvm/umi';

export const DEFAULT_MARKETPLACE_FEE_BASIS_POINTS = 500;
export const DEFAULT_MAX_SUPPLY = 100;

// umi's `PublicKey` and kit's `Address` are the same base58 string at runtime but
// carry different compile-time brands. Fixtures created with umi (mpl-core
// assets) flow into kit instruction helpers, so accept either at those seams.
export type AddressLike = Address | PublicKey;
const asAddress = (value?: AddressLike): Address | undefined =>
  value as Address | undefined;

/** Account balance in lamports (as a plain bigint). */
export const getBalance = (svm: LiteSVM, address: AddressLike): bigint =>
  (svm.getBalance(address as never) ?? 0n) as bigint;

/** Compare two addresses (umi PublicKey or kit Address) as strings. */
export const sameAddress = (a: AddressLike, b: AddressLike): boolean =>
  (a as string) === (b as string);

// On-chain account byte layout, mirrored from the umi client's helpers so we
// allocate exactly the right space and can slice the trailing item section.
const MAX_URI_LENGTH = 196;
const PADDING_SIZE = 320;
const FEE_ACCOUNT_SIZE = 32 + 2; // address + basis points
const JELLYBEAN_MACHINE_BASE_SIZE =
  8 + // discriminator
  1 + // version
  32 + // authority
  32 + // mint authority
  4 + // fee account vec size
  41 + // print fee config
  1 + // items loaded
  8 + // supply loaded
  8 + // supply redeemed
  8 + // supply settled
  1 + // state
  MAX_URI_LENGTH + // uri
  PADDING_SIZE; // padding

export const getJellybeanMachineBaseSize = (feeAccounts: number): number =>
  JELLYBEAN_MACHINE_BASE_SIZE + feeAccounts * FEE_ACCOUNT_SIZE;

export type Client = {
  svm: LiteSVM;
  /** umi bound to the same LiteSVM, for mpl-core / gumball scaffolding. */
  umi: Umi;
  /**
   * Default fee payer and machine authority. Shares its keypair with
   * `umi.identity`, so umi-created assets are owned by the machine authority.
   */
  payer: TransactionSigner;
};

/** SOL amount expressed in lamports (1 SOL = 1e9 lamports). */
export const sol = (amount: number): bigint => BigInt(Math.round(amount * 1e9));

export const generateKeyPairSignerWithSol = async (
  svm: LiteSVM,
  putativeLamports: bigint = sol(100)
): Promise<TransactionSigner> => {
  const signer = await generateKeyPairSigner();
  // litesvm ships @solana/kit v6 types; the client is on v7. The runtime shapes
  // are identical, so we cast at the litesvm boundary.
  svm.airdrop(signer.address as never, lamports(putativeLamports) as never);
  return signer;
};

export const createClient = async (): Promise<Client> => {
  const svm = createSvm();
  const { umi, keypair } = await createUmiForSvm(svm);
  // Mirror umi's identity as the kit fee payer (same ed25519 key).
  const payer = await createKeyPairSignerFromBytes(keypair.secretKey);
  return { svm, umi, payer };
};

/**
 * Build, sign and send a transaction to LiteSVM. All signers (fee payer plus any
 * new-account or authority signers carried in the instruction account metas) are
 * collected by `signTransactionMessageWithSigners`. Throws on a failed
 * transaction with the program logs in the message so tests can assert on error
 * codes.
 */
export const sendTransaction = async (
  svm: LiteSVM,
  feePayer: TransactionSigner,
  instructions: Instruction[]
): Promise<TransactionMetadata> => {
  const blockhash = svm.latestBlockhash() as unknown as Blockhash;
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash, lastValidBlockHeight: 2n ** 63n },
        m
      ),
    (m) => appendTransactionMessageInstructions(instructions, m)
  );
  const signedTransaction = await signTransactionMessageWithSigners(message);
  const result = svm.sendTransaction(signedTransaction as never);
  if (result instanceof FailedTransactionMetadata) {
    // Surface both the top-level transaction error and the program logs (which
    // carry Anchor's `Error Code:`/`custom program error` strings).
    const logs = result.meta().logs().join('\n');
    throw new Error(`Transaction failed: ${result.toString()}\n${logs}`);
  }
  return result;
};

export const getDefaultFeeAccounts = (
  authority: Address,
  marketplaceFeeAccount?: Address
): FeeAccountArgs[] =>
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

export type CreateJellybeanMachineInput = {
  jellybeanMachine?: TransactionSigner;
  authority?: Address;
  args: SettingsArgsArgs;
};

/**
 * Mirror of the umi client's `createJellybeanMachine`: allocate the machine
 * account with the System program, then initialize it. Returns the machine
 * address.
 */
export const createJellybeanMachine = async (
  client: Client,
  input: CreateJellybeanMachineInput
): Promise<Address> => {
  const machine = input.jellybeanMachine ?? (await generateKeyPairSigner());
  const authority = input.authority ?? client.payer.address;
  const space = getJellybeanMachineBaseSize(input.args.feeAccounts.length);
  const rentLamports = client.svm.minimumBalanceForRentExemption(BigInt(space));

  const createAccountIx = getCreateAccountInstruction({
    payer: client.payer,
    newAccount: machine,
    lamports: rentLamports,
    space: BigInt(space),
    programAddress: MALLOW_JELLYBEAN_PROGRAM_ADDRESS,
  });

  const initializeIx = await getInitializeInstructionAsync({
    jellybeanMachine: machine.address,
    authority,
    payer: client.payer,
    args: input.args,
  });

  await sendTransaction(client.svm, client.payer, [
    createAccountIx,
    initializeIx,
  ]);

  return machine.address;
};

// -----------------------------------------------------------------------------
// mpl-core asset scaffolding (umi, over the shared LiteSVM)
// -----------------------------------------------------------------------------

export const defaultAssetData = () => ({
  name: 'My Asset',
  sellerFeeBasisPoints: percentAmount(10, 2),
  uri: 'https://example.com/my-asset.json',
});

export const createCoreAsset = async (
  umi: Umi,
  input: Partial<Parameters<typeof baseCreateCoreAsset>[1]> = {}
): Promise<Signer> => {
  const asset = generateSigner(umi);
  await baseCreateCoreAsset(umi, {
    asset,
    ...defaultAssetData(),
    plugins: [
      {
        type: 'Royalties',
        basisPoints: 1000,
        creators: [{ address: umi.identity.publicKey, percentage: 100 }],
        ruleSet: ruleSet('None'),
      },
    ],
    ...input,
  }).sendAndConfirm(umi);
  return asset;
};

export const createMasterEdition = async (
  umi: Umi,
  input?: Partial<Parameters<typeof createCollection>[1]> & {
    maxSupply?: number | undefined;
  }
): Promise<Signer> => {
  const collection = generateSigner(umi);
  await createCollection(umi, {
    collection,
    ...defaultAssetData(),
    plugins: [
      {
        type: 'Royalties',
        basisPoints: 1000,
        creators: [{ address: umi.identity.publicKey, percentage: 100 }],
        ruleSet: ruleSet('None'),
      },
      {
        type: 'MasterEdition',
        maxSupply:
          input != null && 'maxSupply' in input
            ? input.maxSupply
            : DEFAULT_MAX_SUPPLY,
      },
    ],
    ...input,
  }).sendAndConfirm(umi);
  return collection;
};

// -----------------------------------------------------------------------------
// Jellybean instruction helpers (kit)
// -----------------------------------------------------------------------------

export const addCoreItem = async (
  client: Client,
  input: {
    jellybeanMachine: Address;
    asset?: AddressLike;
    collection?: AddressLike;
  }
): Promise<TransactionMetadata> => {
  const ix = await getAddCoreItemInstructionAsync({
    jellybeanMachine: input.jellybeanMachine,
    authority: client.payer,
    payer: client.payer,
    asset: asAddress(input.asset),
    collection: asAddress(input.collection),
  });
  return sendTransaction(client.svm, client.payer, [ix]);
};

export const startSale = async (
  client: Client,
  jellybeanMachine: Address
): Promise<TransactionMetadata> =>
  sendTransaction(client.svm, client.payer, [
    getStartSaleInstruction({ jellybeanMachine, authority: client.payer }),
  ]);

export const endSale = async (
  client: Client,
  jellybeanMachine: Address
): Promise<TransactionMetadata> =>
  sendTransaction(client.svm, client.payer, [
    getEndSaleInstruction({ jellybeanMachine, authority: client.payer }),
  ]);

/** Withdraws proceeds and closes the (guardless) machine account. */
export const withdraw = async (
  client: Client,
  jellybeanMachine: Address
): Promise<TransactionMetadata> =>
  sendTransaction(client.svm, client.payer, [
    getWithdrawInstruction({
      jellybeanMachine,
      authority: client.payer,
      mintAuthority: client.payer,
    }),
  ]);

export const removeCoreItem = async (
  client: Client,
  input: {
    jellybeanMachine: Address;
    index: number;
    asset?: AddressLike;
    collection?: AddressLike;
  }
): Promise<TransactionMetadata> => {
  const ix = await getRemoveCoreItemInstructionAsync({
    jellybeanMachine: input.jellybeanMachine,
    authority: client.payer,
    asset: asAddress(input.asset),
    collection: asAddress(input.collection),
    index: input.index,
  });
  return sendTransaction(client.svm, client.payer, [ix]);
};

/**
 * Draw a prize for `buyer` from a guardless machine. The machine's mint
 * authority (the client payer) co-signs in place of a gumball guard.
 */
export const draw = async (
  client: Client,
  input: {
    jellybeanMachine: Address;
    buyer: TransactionSigner;
    printFeeAccount?: Address;
  }
): Promise<TransactionMetadata> => {
  const ix = await getDrawInstructionAsync({
    jellybeanMachine: input.jellybeanMachine,
    mintAuthority: client.payer,
    payer: input.buyer,
    buyer: input.buyer.address,
    printFeeAccount: input.printFeeAccount,
  });
  return sendTransaction(client.svm, input.buyer, [
    getSetComputeUnitLimitInstruction({ units: 1_400_000 }),
    ix,
  ]);
};

export const claimCoreItem = async (
  client: Client,
  input: {
    jellybeanMachine: Address;
    /** Recipient of the prize (the buyer who drew it). */
    buyer: Address;
    /** Fee payer; defaults to the buyer's own signer when provided as one. */
    payer: TransactionSigner;
    index: number;
    asset?: AddressLike;
    collection?: AddressLike;
    printAsset?: TransactionSigner;
  }
): Promise<TransactionMetadata> => {
  const ix = await getClaimCoreItemInstructionAsync({
    payer: input.payer,
    jellybeanMachine: input.jellybeanMachine,
    buyer: input.buyer,
    asset: asAddress(input.asset),
    collection: asAddress(input.collection),
    printAsset: input.printAsset,
    index: input.index,
  });
  return sendTransaction(client.svm, input.payer, [
    getSetComputeUnitLimitInstruction({ units: 1_400_000 }),
    ix,
  ]);
};

/**
 * Mirror of the umi `create` helper for the kit client. Creates a guardless
 * machine (kit `draw` uses the machine's own mint authority, so no gumball guard
 * is needed for the non-guard flows), optionally adds items and starts the sale.
 */
export const create = async (
  client: Client,
  input: {
    jellybeanMachine?: TransactionSigner;
    feeAccounts?: FeeAccountArgs[];
    uri?: string;
    printFeeConfig?: SettingsArgsArgs['printFeeConfig'];
    items?: { asset?: AddressLike; collection?: AddressLike }[];
    startSale?: boolean;
  } = {}
): Promise<Address> => {
  const jellybeanMachine = await createJellybeanMachine(client, {
    jellybeanMachine: input.jellybeanMachine,
    args: {
      feeAccounts:
        input.feeAccounts ?? getDefaultFeeAccounts(client.payer.address),
      uri: input.uri ?? 'https://example.com/jellybean-machine.json',
      printFeeConfig: input.printFeeConfig,
    },
  });

  for (const item of input.items ?? []) {
    await addCoreItem(client, { jellybeanMachine, ...item });
  }

  if (input.startSale) {
    await startSale(client, jellybeanMachine);
  }

  return jellybeanMachine;
};

// -----------------------------------------------------------------------------
// Account fetching (kit)
// -----------------------------------------------------------------------------

export const fetchJellybeanMachine = (
  svm: LiteSVM,
  machine: Address
): JellybeanMachine => {
  const account = svm.getAccount(machine as never);
  if (!account || !account.exists) {
    throw new Error(`Jellybean machine ${machine} not found`);
  }
  return decodeJellybeanMachine(account as never).data;
};

export const safeFetchJellybeanMachine = (
  svm: LiteSVM,
  machine: Address
): JellybeanMachine | null => {
  const account = svm.getAccount(machine as never);
  if (!account || !account.exists) return null;
  return decodeJellybeanMachine(account as never).data;
};

/** Fetch and decode the buyer's UnclaimedPrizes PDA. Throws if it doesn't exist. */
export const fetchUnclaimedPrizesFromSeeds = async (
  svm: LiteSVM,
  seeds: { jellybeanMachine: Address; buyer: Address }
): Promise<UnclaimedPrizes> => {
  const [pda] = await findUnclaimedPrizesPda(seeds);
  const account = svm.getAccount(pda as never);
  if (!account || !account.exists) {
    throw new Error(`The account of type [UnclaimedPrizes] was not found`);
  }
  return decodeUnclaimedPrizes(account as never).data;
};

export const safeFetchUnclaimedPrizesFromSeeds = async (
  svm: LiteSVM,
  seeds: { jellybeanMachine: Address; buyer: Address }
): Promise<UnclaimedPrizes | null> => {
  const [pda] = await findUnclaimedPrizesPda(seeds);
  const account = svm.getAccount(pda as never);
  if (!account || !account.exists) return null;
  return decodeUnclaimedPrizes(account as never).data;
};

export type JellybeanMachineItem = {
  index: number;
  mint: Address;
  supplyLoaded: number;
  supplyRedeemed: number;
  supplyClaimed: number;
  escrowAmount: bigint;
};

export type JellybeanMachineWithItems = JellybeanMachine & {
  items: JellybeanMachineItem[];
};

const ITEM_SIZE = 32 + 4 + 4 + 4 + 8;

/**
 * Fetch the machine and decode its trailing "hidden section" of items. Mirrors
 * the umi client's `fetchJellybeanMachineWithItems`.
 */
export const fetchJellybeanMachineWithItems = (
  svm: LiteSVM,
  machine: Address
): JellybeanMachineWithItems => {
  const account = svm.getAccount(machine as never);
  if (!account || !account.exists) {
    throw new Error(`Jellybean machine ${machine} not found`);
  }
  const base = decodeJellybeanMachine(account as never).data;
  const data = new Uint8Array(account.data as unknown as ArrayLike<number>);
  const offset = getJellybeanMachineBaseSize(base.feeAccounts.length);
  const itemsDecoder = getArrayDecoder(
    getStructDecoder([
      ['mint', getAddressDecoder()],
      ['supplyLoaded', getU32Decoder()],
      ['supplyRedeemed', getU32Decoder()],
      ['supplyClaimed', getU32Decoder()],
      ['escrowAmount', getU64Decoder()],
    ]),
    { size: base.itemsLoaded }
  );
  const decoded = itemsDecoder.decode(
    data.slice(offset, offset + base.itemsLoaded * ITEM_SIZE)
  );
  return {
    ...base,
    items: decoded.map((item, index) => ({ ...item, index })),
  };
};
