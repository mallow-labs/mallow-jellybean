import { findJellybeanEventAuthorityPda } from '@mallow-labs/mallow-gumball';
import { Context, Pda, PublicKey } from '@metaplex-foundation/umi';
import { ResolvedAccount } from '../generated';

export const findEventAuthorityPda = findJellybeanEventAuthorityPda;

export const resolveEventAuthorityPda = (
  context: Pick<Context, 'eddsa' | 'programs' | 'identity' | 'payer'>,
  _accounts: Record<string, ResolvedAccount>,
  _args?: Record<string, unknown>,
  _programId?: PublicKey,
  _isWritable?: boolean
): { value: Pda | null } => ({
  value: findEventAuthorityPda(context),
});
