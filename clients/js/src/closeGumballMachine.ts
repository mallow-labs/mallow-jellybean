import {
  findAssociatedTokenPda,
  SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
  SPL_SYSTEM_PROGRAM_ID,
} from '@metaplex-foundation/mpl-toolbox';
import {
  Context,
  defaultPublicKey,
  publicKey,
  PublicKey,
  transactionBuilder,
  TransactionBuilder,
} from '@metaplex-foundation/umi';
import { deleteGumballGuard } from './generated';

export type CloseGumballMachineInput = Parameters<
  typeof deleteGumballGuard
>[1] & {
  paymentMint?: PublicKey;
};

export const closeGumballMachine = (
  context: Parameters<typeof deleteGumballGuard>[0] & Pick<Context, 'rpc'>,
  input: CloseGumballMachineInput
): TransactionBuilder => {
  const builder = deleteGumballGuard(context, input);
  return transactionBuilder().add(
    input.paymentMint != null && input.paymentMint !== defaultPublicKey()
      ? builder.addRemainingAccounts([
          {
            pubkey: input.paymentMint,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: findAssociatedTokenPda(context, {
              mint: input.paymentMint,
              owner: context.identity.publicKey,
            })[0],
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: SPL_SYSTEM_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: publicKey('SysvarRent111111111111111111111111111111111'),
            isSigner: false,
            isWritable: false,
          },
        ])
      : builder
  );
};
