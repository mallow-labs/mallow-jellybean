import { findJellybeanMachineAuthorityPda } from '@mallow-labs/mallow-gumball';
import { Context, Pda, PublicKey } from '@metaplex-foundation/umi';
import { expectPublicKey, ResolvedAccount } from '../generated';

export const findAuthorityPda = findJellybeanMachineAuthorityPda;

export const resolveAuthorityPda = (
  context: Pick<Context, 'eddsa' | 'programs' | 'identity' | 'payer'>,
  accounts: Record<string, ResolvedAccount>,
  _args?: Record<string, unknown>,
  _programId?: PublicKey,
  _isWritable?: boolean
): { value: Pda | null } => ({
  value: findAuthorityPda(context, {
    jellybeanMachine: expectPublicKey(accounts.jellybeanMachine.value),
  }),
});
