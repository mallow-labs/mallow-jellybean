import {
  createGumballGuard,
  defaultGumballGuardNames,
  findGumballGuardPda,
  getDefaultGuardRepository,
  getDrawJellybeanInstructionAsync,
  getMerkleProof,
  getMerkleRoot,
  getWrapInstruction,
  MachineType,
  parseGuardRemainingAccounts,
  parseMintArgs,
  route,
  type MintContext,
} from '@mallow-labs/mallow-gumball';
import {
  createAssociatedToken,
  createMint,
  findAssociatedTokenPda,
  mintTokensTo,
} from '@metaplex-foundation/mpl-toolbox';
import {
  createSignerFromKeypair,
  publicKey,
  transactionBuilder,
  type PublicKey,
  type PublicKeyInput,
  type Signer,
  type Umi,
} from '@metaplex-foundation/umi';
import { getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import {
  generateKeyPairSigner,
  lamports,
  none,
  some,
  type Address,
  type Instruction,
  type OptionOrNullable,
  type TransactionSigner,
} from '@solana/kit';
import { MALLOW_JELLYBEAN_PROGRAM_ADDRESS, type FeeAccountArgs } from '../src';
import {
  addCoreItem,
  createJellybeanMachine,
  generateKeyPairSignerWithSol,
  getDefaultFeeAccounts,
  sendTransaction,
  sol,
  startSale,
  type AddressLike,
  type Client,
} from './_setup';

export const DEFAULT_SOL_PAYMENT_LAMPORTS = lamports(sol(0.1));

const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));
export const yesterday = (): bigint => nowSeconds() - 3600n * 24n;
export const tomorrow = (): bigint => nowSeconds() + 3600n * 24n;

/**
 * High-level guarded jellybean draw builder (kit). The gumball client only ships
 * a low-level `getDrawJellybeanInstructionAsync` (raw `mintArgs` bytes), so we
 * mirror its `draw` helper: run the guard manifests with `MachineType.Jellybean`
 * to serialize the mint args + collect each guard's remaining accounts, then
 * append them to the draw instruction.
 */
export const drawJellybean = async (input: {
  jellybeanMachine: Address;
  payer: TransactionSigner;
  buyer: TransactionSigner;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mintArgs?: any;
  printFeeAccount?: Address;
  group?: OptionOrNullable<string>;
}): Promise<Instruction> => {
  const gumballGuard = (
    await findGumballGuardPda({ base: input.jellybeanMachine })
  )[0];
  const manifests = getDefaultGuardRepository().forProgram(
    defaultGumballGuardNames
  );
  const mintContext: MintContext = {
    buyer: input.buyer,
    payer: input.payer,
    machine: input.jellybeanMachine,
    gumballGuard,
    machineType: MachineType.Jellybean,
  };
  const { data, remainingAccounts } = await parseMintArgs(
    manifests,
    mintContext,
    input.mintArgs ?? {}
  );
  const instruction = await getDrawJellybeanInstructionAsync({
    gumballGuard,
    jellybeanMachine: input.jellybeanMachine,
    payer: input.payer,
    buyer: input.buyer,
    printFeeAccount: input.printFeeAccount,
    mintArgs: data,
    group: input.group ?? none(),
  });
  return {
    ...instruction,
    accounts: [
      ...(instruction.accounts ?? []),
      ...parseGuardRemainingAccounts(remainingAccounts),
    ],
  };
};

/**
 * Create a jellybean machine with the kit client, then wrap it in a gumball
 * guard with the kit gumball client (both over the shared LiteSVM). The machine
 * keypair is the guard `base`, so it must co-sign `createGumballGuard`.
 */
export const createGuarded = async (
  client: Client,
  input: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guards?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    groups?: any[];
    feeAccounts?: FeeAccountArgs[];
    uri?: string;
    items?: { asset?: AddressLike; collection?: AddressLike }[];
    startSale?: boolean;
  } = {}
): Promise<Address> => {
  const machine = await generateKeyPairSigner();

  await createJellybeanMachine(client, {
    jellybeanMachine: machine,
    args: {
      feeAccounts:
        input.feeAccounts ?? getDefaultFeeAccounts(client.payer.address),
      uri: input.uri ?? 'https://example.com/jellybean-machine.json',
    },
  });

  for (const item of input.items ?? []) {
    await addCoreItem(client, {
      jellybeanMachine: machine.address,
      asset: item.asset,
      collection: item.collection,
    });
  }

  const guards = input.groups
    ? {}
    : (input.guards ?? {
        solPayment: { lamports: DEFAULT_SOL_PAYMENT_LAMPORTS },
      });
  const gumballGuard = (
    await findGumballGuardPda({ base: machine.address })
  )[0];
  await sendTransaction(client.svm, client.payer, [
    await createGumballGuard({
      base: machine,
      authority: client.payer.address,
      payer: client.payer,
      guards,
      groups: input.groups,
    }),
    getWrapInstruction({
      gumballGuard,
      authority: client.payer,
      machine: machine.address,
      machineProgram: MALLOW_JELLYBEAN_PROGRAM_ADDRESS,
      machineAuthority: client.payer,
    }),
  ]);

  if (input.startSale ?? true) {
    await startSale(client, machine.address);
  }

  return machine.address;
};

/** A fresh, funded kit signer to act as a buyer/payer over the shared SVM. */
export const createBuyer = (client: Client): Promise<TransactionSigner> =>
  generateKeyPairSignerWithSol(client.svm);

/** Draw through the gumball guard (kit). */
export const drawGuarded = async (
  client: Client,
  buyer: TransactionSigner,
  input: {
    jellybeanMachine: Address;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mintArgs?: any;
    printFeeAccount?: Address;
    group?: OptionOrNullable<string>;
  }
): Promise<void> => {
  const ix = await drawJellybean({
    jellybeanMachine: input.jellybeanMachine,
    payer: buyer,
    buyer,
    mintArgs: input.mintArgs,
    printFeeAccount: input.printFeeAccount,
    group: input.group,
  });
  await sendTransaction(client.svm, buyer, [
    getSetComputeUnitLimitInstruction({ units: 1_400_000 }),
    ix,
  ]);
};

/**
 * Create an SPL mint and distribute tokens to holders (umi mpl-toolbox, over the
 * shared SVM). Returns `[mint, ...holderAtas]`.
 */
export const createMintWithHolders = async (
  umi: Umi,
  input: {
    holders: { owner: PublicKeyInput; amount: number | bigint }[];
    mintAuthority?: Signer;
  }
): Promise<[Signer, ...PublicKey[]]> => {
  const atas: PublicKey[] = [];
  const mint = umi.eddsa.generateKeypair();
  const mintSigner = createSignerFromKeypair(umi, mint);
  const mintAuthority = input.mintAuthority ?? umi.identity;
  let builder = transactionBuilder().add(
    createMint(umi, {
      mint: mintSigner,
      mintAuthority: mintAuthority.publicKey,
    })
  );
  input.holders.forEach((holder) => {
    const owner = publicKey(holder.owner);
    const [token] = findAssociatedTokenPda(umi, {
      mint: mintSigner.publicKey,
      owner,
    });
    atas.push(token);
    builder = builder.add(
      createAssociatedToken(umi, { mint: mintSigner.publicKey, owner })
    );
    if (holder.amount > 0) {
      builder = builder.add(
        mintTokensTo(umi, {
          mint: mintSigner.publicKey,
          token,
          amount: holder.amount,
          mintAuthority,
        })
      );
    }
  });
  await builder.sendAndConfirm(umi);

  return [mintSigner, ...atas];
};

export { fetchToken } from '@metaplex-foundation/mpl-toolbox';
export { getMerkleProof, getMerkleRoot, MachineType, route, some };
export type { Address, Instruction, TransactionSigner };
