import {
  Account,
  assertAccountExists,
  Context,
  deserializeAccount,
  Pda,
  PublicKey,
  RpcAccount,
  RpcGetAccountOptions,
  publicKey as toPublicKey,
} from '@metaplex-foundation/umi';
import {
  array,
  mapSerializer,
  publicKey,
  Serializer,
  struct,
  u32,
  u64,
} from '@metaplex-foundation/umi/serializers';
import {
  getJellybeanMachineAccountDataSerializer as baseGetJellybeanMachineAccountDataSerializer,
  JellybeanMachineAccountData as BaseJellybeanMachineAccountData,
  JellybeanMachineAccountDataArgs as BaseJellybeanMachineAccountDataArgs,
} from '../generated/accounts/jellybeanMachine';
import { getJellybeanMachineBaseSize } from './createJellybeanMachine';

export type JellybeanMachineWithItems =
  Account<JellybeanMachineAccountWithItemsData>;

export type JellybeanMachineAccountWithItemsData =
  BaseJellybeanMachineAccountData & {
    items: JellybeanMachineItem[];
  };

export type JellybeanMachineAccountWithItemsDataArgs =
  BaseJellybeanMachineAccountDataArgs;

/**
 * Represents an item inside a Jellybean Machine.
 */
export type JellybeanMachineItem = {
  /** The index of the item in all items. */
  readonly index: number;

  /** The asset or master edition collection of the NFT. */
  readonly mint: PublicKey;

  /** The initial supply of the item that can be redeemed. */
  readonly supplyLoaded: number;

  /** The supply of the item that has been redeemed. */
  readonly supplyRedeemed: number;

  /** The supply of the item that has been claimed. */
  readonly supplyClaimed: number;

  /** The escrow amount for the item. */
  readonly escrowAmount: bigint;
};

export const JELLYBEAN_MACHINE_ITEM_SIZE = 32 + 4 + 4 + 4 + 8;

type JellybeanMachineHiddenSection = {
  items: Omit<JellybeanMachineItem, 'index'>[];
};

function getHiddenSection(
  _version: number,
  itemsLoaded: number,
  slice: Uint8Array
): JellybeanMachineHiddenSection {
  const hiddenSectionSerializer: Serializer<JellybeanMachineHiddenSection> =
    struct<JellybeanMachineHiddenSection>([
      [
        'items',
        array(
          struct<{
            mint: PublicKey;
            supplyLoaded: number;
            supplyRedeemed: number;
            supplyClaimed: number;
            escrowAmount: bigint;
          }>([
            ['mint', publicKey()],
            ['supplyLoaded', u32()],
            ['supplyRedeemed', u32()],
            ['supplyClaimed', u32()],
            ['escrowAmount', u64()],
          ]),
          { size: itemsLoaded }
        ),
      ],
    ]);

  const [hiddenSection] = hiddenSectionSerializer.deserialize(slice);
  return hiddenSection;
}

export function getJellybeanMachineAccountWithItemsDataSerializer(): Serializer<
  JellybeanMachineAccountWithItemsDataArgs,
  JellybeanMachineAccountWithItemsData
> {
  return mapSerializer<
    JellybeanMachineAccountWithItemsDataArgs,
    BaseJellybeanMachineAccountDataArgs,
    JellybeanMachineAccountWithItemsData,
    BaseJellybeanMachineAccountData
  >(
    baseGetJellybeanMachineAccountDataSerializer(),
    (args) => args,
    (base, bytes, offset) => {
      const slice = bytes.slice(
        offset + getJellybeanMachineBaseSize(base.feeAccounts.length)
      );
      const hiddenSection = getHiddenSection(
        base.version,
        base.itemsLoaded,
        slice
      );

      return {
        ...base,
        items: hiddenSection.items.map((item, index) => ({
          ...item,
          index,
        })),
      };
    }
  );
}

export function deserializeJellybeanMachineWithItems(
  rawAccount: RpcAccount
): JellybeanMachineWithItems {
  return deserializeAccount(
    rawAccount,
    getJellybeanMachineAccountWithItemsDataSerializer()
  );
}

export async function fetchJellybeanMachineWithItems(
  context: Pick<Context, 'rpc'>,
  publicKey: PublicKey | Pda,
  options?: RpcGetAccountOptions
): Promise<JellybeanMachineWithItems> {
  const maybeAccount = await context.rpc.getAccount(
    toPublicKey(publicKey, false),
    options
  );
  assertAccountExists(maybeAccount, 'JellybeanMachine');
  return deserializeJellybeanMachineWithItems(maybeAccount);
}

export async function safeFetchJellybeanMachineWithItems(
  context: Pick<Context, 'rpc'>,
  publicKey: PublicKey | Pda,
  options?: RpcGetAccountOptions
): Promise<JellybeanMachineWithItems | null> {
  const maybeAccount = await context.rpc.getAccount(
    toPublicKey(publicKey, false),
    options
  );
  return maybeAccount.exists
    ? deserializeJellybeanMachineWithItems(maybeAccount)
    : null;
}
