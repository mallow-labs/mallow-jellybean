import { Context, PublicKey } from '@metaplex-foundation/umi';
import { expectPublicKey, ResolvedAccount } from '../generated';

export const resolveProgram = (
  _context: Pick<Context, 'eddsa' | 'programs' | 'identity' | 'payer'>,
  accounts: Record<string, ResolvedAccount>,
  _args?: Record<string, unknown>,
  programId?: PublicKey,
  _isWritable?: boolean
): { value: PublicKey | null } => ({
  value: expectPublicKey(accounts.program.value ?? programId),
});
