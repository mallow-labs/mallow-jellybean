import { createAccount } from '@metaplex-foundation/mpl-toolbox';
import {
  Context,
  Signer,
  transactionBuilder,
  TransactionBuilder,
} from '@metaplex-foundation/umi';
import { initialize } from '../generated';

export const MAX_FEE_ACCOUNTS = 6;
export const FEE_ACCOUNT_SIZE = 32 + 2; // address + basis points
export const MAX_URI_LENGTH = 196;
export const PADDING_SIZE = 320;

export const JELLYBEAN_MACHINE_BASE_SIZE =
  8 + // discriminator
  1 + // version
  32 + // authority
  32 + // mint authority
  MAX_FEE_ACCOUNTS * FEE_ACCOUNT_SIZE + // fee accounts
  2 + // items loaded
  8 + // supply loaded
  8 + // supply redeemed
  8 + // supply settled
  1 + // state
  MAX_URI_LENGTH + // uri
  PADDING_SIZE; // padding

export type CreateJellybeanMachineInput = Omit<
  Parameters<typeof initialize>[1],
  'jellybeanMachine'
> & {
  jellybeanMachine: Signer;
};

export const createJellybeanMachine = async (
  context: Parameters<typeof initialize>[0] & Pick<Context, 'rpc'>,
  input: CreateJellybeanMachineInput
): Promise<TransactionBuilder> => {
  const space = JELLYBEAN_MACHINE_BASE_SIZE;
  const lamports = await context.rpc.getRent(space);

  return transactionBuilder()
    .add(
      createAccount(context, {
        newAccount: input.jellybeanMachine,
        lamports,
        space,
        programId: context.programs.get('mallowJellybean').publicKey,
      })
    )
    .add(
      initialize(context, {
        ...input,
        jellybeanMachine: input.jellybeanMachine.publicKey,
      })
    );
};
