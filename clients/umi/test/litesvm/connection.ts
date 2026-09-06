import { base58 } from '@metaplex-foundation/umi';
import { AccountLayout, MintLayout } from '@solana/spl-token';
import {
  AddressLookupTableAccount,
  Keypair,
  Message,
  MessageV0,
  PublicKey,
  Transaction,
  TransactionExpiredBlockheightExceededError,
  VersionedMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  Account,
  FailedTransactionMetadata,
  LiteSvm,
  TransactionMetadata,
} from 'litesvm/dist/internal';
import { getSvm } from './svm';

// The System program id (`11111111111111111111111111111111`) is the all-zero
// pubkey — the owner assigned to freshly-funded system accounts.
const SYSTEM_PROGRAM_ID_BYTES = new Uint8Array(32);

// umi's `base58` serializer bridges bytes <-> base58 string: `deserialize` turns
// bytes into the string, `serialize` turns the string back into bytes.
const base58Encode = (bytes: Uint8Array): string =>
  base58.deserialize(bytes)[0];
const base58Decode = (str: string): Uint8Array => base58.serialize(str);

/**
 * A serialized transaction begins with a compact-u16 signature count (always a
 * single byte here since sig counts are tiny), followed by 64-byte signatures,
 * then the message. Legacy messages start with the writable-signer count; a
 * versioned message's first byte has the high bit set (0x80 | version).
 */
function isVersioned(raw: Uint8Array): boolean {
  const sigCount = raw[0];
  const messageStart = 1 + sigCount * 64;
  return (raw[messageStart] & 0x80) !== 0;
}

/** First signature of a serialized transaction, base58-encoded (its txid). */
function firstSignature(raw: Uint8Array): string {
  return base58Encode(raw.slice(1, 65));
}

/**
 * Rebuild the web3.js message from a serialized transaction so `getTransaction`
 * can hand umi's `fromWeb3JsMessage` a real `Message`/`MessageV0` (it dereferences
 * `.version`, `.staticAccountKeys`, `.compiledInstructions`, etc.). The message
 * follows the compact-u16 signature count and the fixed-width signatures.
 */
function messageFromRaw(raw: Uint8Array): Message | MessageV0 {
  const messageBytes = raw.slice(1 + raw[0] * 64);
  return isVersioned(raw)
    ? (VersionedMessage.deserialize(messageBytes) as MessageV0)
    : Message.from(messageBytes);
}

/**
 * Structural check for a VersionedTransaction. `instanceof` is unreliable here:
 * the SDK and this shim can resolve different `@solana/web3.js` module instances,
 * so a VersionedTransaction built by the SDK fails an `instanceof` against our
 * imported class. A legacy `Transaction` exposes `.instructions`; a
 * `VersionedTransaction` exposes `.message` and no `.instructions`.
 */
function isVersionedTransaction(
  tx: Transaction | VersionedTransaction
): tx is VersionedTransaction {
  return (
    (tx as any).message !== undefined && (tx as any).instructions === undefined
  );
}

/**
 * Turn a FailedTransactionMetadata into a thrown-friendly Error that the test
 * assertion helpers can introspect. The logs already contain both `custom
 * program error: 0x<hex>` and Anchor's `Error Number: <n>`, but we also surface a
 * JSON-RPC style `{"InstructionError":[i,{"Custom":n}]}` string for the code branch.
 */
function toTransactionError(failed: FailedTransactionMetadata): Error & {
  logs: string[];
  err: unknown;
} {
  const logs = failed.meta().logs();

  let jsonErr: unknown = 'TransactionError';
  let rpcString = '';
  try {
    const inner = failed.err() as any;
    if (
      inner &&
      typeof inner.err === 'function' &&
      typeof inner.index === 'number'
    ) {
      const instErr = inner.err();
      if (instErr && typeof instErr.code === 'number') {
        jsonErr = { InstructionError: [inner.index, { Custom: instErr.code }] };
        rpcString =
          JSON.stringify(jsonErr) + ` (error: 0x${instErr.code.toString(16)})`;
      } else {
        jsonErr = { InstructionError: [inner.index, String(instErr)] };
        rpcString = JSON.stringify(jsonErr);
      }
    } else {
      jsonErr = String(inner);
      rpcString = String(inner);
    }
  } catch {
    rpcString = failed.toString();
  }

  const error = new Error(
    `Transaction failed: ${rpcString}\n${logs.join('\n')}`
  ) as Error & {
    logs: string[];
    err: unknown;
    toJSON: () => unknown;
  };
  error.logs = logs;
  error.err = jsonErr;
  error.toJSON = () => jsonErr;
  return error;
}

type CachedResult = {
  err: (Error & { logs: string[]; err: unknown }) | null;
  logs: string[];
  // The executed transaction's message, so `getTransaction` can return a real
  // web3.js message. Absent for synthetic results (e.g. airdrops).
  message?: Message | MessageV0;
};

// Seconds added on top of real wall-clock time when syncing LiteSVM's clock.
const clockOffsetSecs = 0;

/**
 * A duck-typed `@solana/web3.js` Connection backed by an in-process LiteSVM.
 *
 * Only the surface umi's `web3JsRpc` (and the mpl-toolbox/mpl-core umi plugins)
 * actually exercise is implemented. It is passed to umi's `testPlugins` cast as
 * a `Connection`.
 *
 * Execution is synchronous inside LiteSVM: a transaction runs the moment it is
 * submitted. We cache each result by signature so a later `confirmTransaction` /
 * `getSignatureStatuses` reports the true outcome.
 */
export class LiteSVMConnection {
  readonly rpcEndpoint = 'litesvm://in-process';
  readonly commitment = 'processed' as const;
  private results = new Map<string, CachedResult>();

  get svm(): LiteSvm {
    return getSvm();
  }

  private slot(): number {
    return Number(this.svm.getClock().slot);
  }

  /**
   * Advance LiteSVM's clock to real wall-clock time before executing. On a real
   * validator time advances continuously, and the tests assert on-chain
   * timestamps against `now()`. LiteSVM's clock is otherwise frozen at genesis
   * (unix 0), so sync it here. The slot is bumped too so slot-sensitive logic
   * (and the SlotHashes sysvar the jellybean `draw` reads) sees forward progress.
   */
  private syncClock(): void {
    const nextSlot = this.svm.getClock().slot + 1n;
    this.svm.warpToSlot(nextSlot);
    const clock = this.svm.getClock();
    clock.unixTimestamp = BigInt(
      Math.floor(Date.now() / 1000) + clockOffsetSecs
    );
    this.svm.setClock(clock);
  }

  private execute(raw: Uint8Array): { sig: string; result: CachedResult } {
    this.syncClock();
    const res = isVersioned(raw)
      ? this.svm.sendVersionedTransaction(raw)
      : this.svm.sendLegacyTransaction(raw);
    const sig = firstSignature(raw);
    const message = messageFromRaw(raw);

    let result: CachedResult;
    if (res instanceof FailedTransactionMetadata) {
      result = {
        err: toTransactionError(res),
        logs: res.meta().logs(),
        message,
      };
    } else {
      result = {
        err: null,
        logs: (res as TransactionMetadata).logs(),
        message,
      };
    }
    this.results.set(sig, result);
    return { sig, result };
  }

  private toAccountInfo(acc: Account | null) {
    if (!acc) return null;
    return {
      executable: acc.executable(),
      owner: new PublicKey(acc.owner()),
      lamports: Number(acc.lamports()),
      data: Buffer.from(acc.data()),
      rentEpoch: Number(acc.rentEpoch()),
    };
  }

  // --- reads ---------------------------------------------------------------

  async getAccountInfo(pubkey: PublicKey, _commitment?: unknown) {
    return this.toAccountInfo(this.svm.getAccount(pubkey.toBytes()));
  }

  async getAccountInfoAndContext(pubkey: PublicKey, _commitment?: unknown) {
    return {
      context: { slot: this.slot() },
      value: await this.getAccountInfo(pubkey),
    };
  }

  async getMultipleAccountsInfo(pubkeys: PublicKey[], _commitment?: unknown) {
    return pubkeys.map((pk) =>
      this.toAccountInfo(this.svm.getAccount(pk.toBytes()))
    );
  }

  async getMultipleAccountsInfoAndContext(
    pubkeys: PublicKey[],
    _commitment?: unknown
  ) {
    return {
      context: { slot: this.slot() },
      value: await this.getMultipleAccountsInfo(pubkeys),
    };
  }

  async getProgramAccounts(_programId: PublicKey, _config?: unknown) {
    // The native LiteSVM binding has no owner index; no jellybean test relies on
    // enumerating program accounts. Return empty rather than throw.
    return [];
  }

  async getBalance(pubkey: PublicKey, _commitment?: unknown) {
    return Number(this.svm.getBalance(pubkey.toBytes()) ?? 0n);
  }

  async getBalanceAndContext(pubkey: PublicKey, _commitment?: unknown) {
    return {
      context: { slot: this.slot() },
      value: await this.getBalance(pubkey),
    };
  }

  async getMinimumBalanceForRentExemption(
    dataLength: number,
    _commitment?: unknown
  ) {
    return Number(this.svm.minimumBalanceForRentExemption(BigInt(dataLength)));
  }

  async getTokenAccountBalance(pubkey: PublicKey, _commitment?: unknown) {
    const acc = this.svm.getAccount(pubkey.toBytes());
    if (!acc)
      throw new Error(`Could not find token account ${pubkey.toBase58()}`);
    const tokenAccount = AccountLayout.decode(Buffer.from(acc.data()));
    const mintAcc = this.svm.getAccount(tokenAccount.mint.toBytes());
    const decimals = mintAcc
      ? MintLayout.decode(Buffer.from(mintAcc.data())).decimals
      : 0;
    const amount = tokenAccount.amount;
    const uiAmount = Number(amount) / 10 ** decimals;
    return {
      context: { slot: this.slot() },
      value: {
        amount: amount.toString(),
        decimals,
        uiAmount,
        uiAmountString: uiAmount.toString(),
      },
    };
  }

  async getLatestBlockhash(_commitmentOrConfig?: unknown) {
    return {
      blockhash: this.svm.latestBlockhash(),
      lastValidBlockHeight: this.slot() + 150,
    };
  }

  async getLatestBlockhashAndContext(_commitmentOrConfig?: unknown) {
    return {
      context: { slot: this.slot() },
      value: await this.getLatestBlockhash(),
    };
  }

  async getRecentBlockhash(_commitment?: unknown) {
    return {
      blockhash: this.svm.latestBlockhash(),
      feeCalculator: { lamportsPerSignature: 5000 },
    };
  }

  async getSlot(_commitment?: unknown) {
    return this.slot();
  }

  async getBlockHeight(_commitment?: unknown) {
    return this.slot();
  }

  async getBlockTime(_slot: number) {
    return Math.floor(Date.now() / 1000) + clockOffsetSecs;
  }

  async getFeeForMessage(_message: unknown, _commitment?: unknown) {
    return { context: { slot: this.slot() }, value: 5000 };
  }

  async getGenesisHash() {
    return '11111111111111111111111111111111';
  }

  async getAddressLookupTable(accountKey: PublicKey, _config?: unknown) {
    const info = await this.getAccountInfo(accountKey);
    if (!info) return { context: { slot: this.slot() }, value: null };
    const state = AddressLookupTableAccount.deserialize(info.data);
    return {
      context: { slot: this.slot() },
      value: new AddressLookupTableAccount({ key: accountKey, state }),
    };
  }

  // --- signature status ----------------------------------------------------

  async getSignatureStatuses(signatures: string[], _config?: unknown) {
    const slot = this.slot();
    return {
      context: { slot },
      value: signatures.map((sig) => {
        const r = this.results.get(sig);
        if (!r) return null;
        return {
          slot,
          confirmations: null,
          err: r.err,
          confirmationStatus: 'finalized',
        };
      }),
    };
  }

  async getSignatureStatus(signature: string, _config?: unknown) {
    const { context, value } = await this.getSignatureStatuses([signature]);
    return { context, value: value[0] };
  }

  async getTransaction(signature: string, _config?: unknown) {
    let meta: TransactionMetadata | FailedTransactionMetadata | null = null;
    try {
      meta = this.svm.getTransaction(base58Decode(signature));
    } catch {
      meta = null;
    }
    const cached = this.results.get(signature);
    if (!meta && !cached) return null;
    // umi's web3JsRpc.getTransaction feeds `transaction.message` straight into
    // `fromWeb3JsMessage`, so a real message is required. Synthetic results
    // (airdrops) have none and were never true transactions — report not-found.
    if (!cached?.message) return null;

    const tm = meta instanceof FailedTransactionMetadata ? meta.meta() : meta;
    const logs = tm ? tm.logs() : (cached?.logs ?? []);
    const err = cached
      ? cached.err
      : meta instanceof FailedTransactionMetadata
        ? {}
        : null;
    let returnData: { programId: string; data: [string, string] } | null = null;
    try {
      const rd = tm?.returnData();
      const data = rd?.data();
      if (data && data.length > 0) {
        returnData = {
          programId: new PublicKey(rd!.programId()).toBase58(),
          data: [Buffer.from(data).toString('base64'), 'base64'],
        };
      }
    } catch {
      returnData = null;
    }

    return {
      slot: this.slot(),
      blockTime: Math.floor(Date.now() / 1000),
      meta: {
        err,
        fee: 5000,
        logMessages: logs,
        preBalances: [],
        postBalances: [],
        innerInstructions: [],
        preTokenBalances: [],
        postTokenBalances: [],
        returnData,
        computeUnitsConsumed: tm ? Number(tm.computeUnitsConsumed()) : 0,
      },
      transaction: { message: cached.message, signatures: [signature] },
      version: 0 as const,
    };
  }

  // --- writes --------------------------------------------------------------

  async sendRawTransaction(
    rawTransaction: Buffer | Uint8Array | number[],
    options?: { skipPreflight?: boolean }
  ) {
    const raw =
      rawTransaction instanceof Uint8Array
        ? rawTransaction
        : Uint8Array.from(rawTransaction);
    const { sig, result } = this.execute(raw);
    if (result.err && !options?.skipPreflight) throw result.err;
    return sig;
  }

  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    signersOrOptions?: Keypair[] | { skipPreflight?: boolean },
    maybeOptions?: { skipPreflight?: boolean }
  ) {
    let raw: Uint8Array;
    if (isVersionedTransaction(transaction)) {
      raw = transaction.serialize();
    } else {
      const tx = transaction as Transaction;
      const signers = Array.isArray(signersOrOptions) ? signersOrOptions : [];
      if (!tx.recentBlockhash) tx.recentBlockhash = this.svm.latestBlockhash();
      if (!tx.feePayer)
        tx.feePayer = signers[0]?.publicKey ?? tx.signatures[0]?.publicKey;
      if (signers.length) tx.partialSign(...signers);
      raw = tx.serialize();
    }
    const options = Array.isArray(signersOrOptions)
      ? maybeOptions
      : signersOrOptions;
    return this.sendRawTransaction(raw, options);
  }

  async confirmTransaction(
    strategyOrSignature: string | { signature: string },
    _commitment?: unknown
  ) {
    const sig =
      typeof strategyOrSignature === 'string'
        ? strategyOrSignature
        : strategyOrSignature.signature;
    const r = this.results.get(sig);
    // A signature with no recorded result never executed here; a real RPC would
    // never confirm it as a success. Surface the same expiry error web3.js raises
    // when a transaction is never observed on-chain.
    if (!r) throw new TransactionExpiredBlockheightExceededError(sig);
    if (r.err) throw r.err;
    return {
      context: { slot: this.slot() },
      value: { err: r.err },
    };
  }

  async simulateTransaction(
    transaction: Transaction | VersionedTransaction,
    _configOrSigners?: unknown,
    _includeAccounts?: unknown
  ) {
    this.syncClock();
    let raw: Uint8Array;
    const versioned = isVersionedTransaction(transaction);
    if (versioned) {
      raw = transaction.serialize();
    } else {
      const tx = transaction as Transaction;
      if (!tx.recentBlockhash) tx.recentBlockhash = this.svm.latestBlockhash();
      if (!tx.feePayer) tx.feePayer = tx.signatures[0]?.publicKey;
      raw = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
    }

    const res = versioned
      ? this.svm.simulateVersionedTransaction(raw)
      : this.svm.simulateLegacyTransaction(raw);
    const slot = this.slot();

    if (res instanceof FailedTransactionMetadata) {
      const meta = res.meta();
      return {
        context: { slot },
        value: {
          err: toTransactionError(res),
          logs: meta.logs(),
          unitsConsumed: Number(meta.computeUnitsConsumed()),
          accounts: null,
          returnData: null,
        },
      };
    }

    const meta = (res as any).meta();
    return {
      context: { slot },
      value: {
        err: null,
        logs: meta.logs(),
        unitsConsumed: Number(meta.computeUnitsConsumed()),
        accounts: null,
        returnData: null,
      },
    };
  }

  // --- funding -------------------------------------------------------------

  async requestAirdrop(to: PublicKey, lamports: number) {
    // Credit lamports directly via setAccount rather than LiteSVM's `airdrop`
    // (a system transfer that rejects sub-rent-exempt recipients with
    // InsufficientFundsForRent). A real validator's `requestAirdrop` funds tiny
    // balances freely, and several tests fund a deliberately-underfunded payer
    // to prove downstream instructions fail — so mirror the lenient behavior.
    const key = to.toBytes();
    const existing = this.svm.getAccount(key);
    const current = existing ? existing.lamports() : 0n;
    const data = existing ? existing.data() : new Uint8Array(0);
    const owner = existing ? existing.owner() : SYSTEM_PROGRAM_ID_BYTES;
    const executable = existing ? existing.executable() : false;
    const rentEpoch = existing ? existing.rentEpoch() : 0n;
    this.svm.setAccount(
      key,
      new Account(
        current + BigInt(lamports),
        data,
        owner,
        executable,
        rentEpoch
      )
    );
    const sig = base58Encode(Keypair.generate().publicKey.toBytes());
    this.results.set(sig, { err: null, logs: [] });
    return sig;
  }

  // --- subscription no-ops (some libs register listeners) ------------------

  onAccountChange() {
    return 0;
  }
  async removeAccountChangeListener() {}
  onSignature() {
    return 0;
  }
  async removeSignatureListener() {}
  onLogs() {
    return 0;
  }
  async removeOnLogsListener() {}
}
