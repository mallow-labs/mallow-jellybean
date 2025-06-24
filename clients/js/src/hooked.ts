import {
  Address,
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  ProgramDerivedAddress,
} from '@solana/kit';
import { expectAddress, ResolvedAccount } from './generated/shared';

export type AuthoritySeeds = {
  jellybeanMachine: Address;
};

export async function findAuthorityPda(
  seeds: AuthoritySeeds,
  config: { programAddress?: Address | undefined } = {}
): Promise<ProgramDerivedAddress> {
  const {
    programAddress = 'J3LLYcm8V5hJRzCKENRPW3yGdQ6xU8Nie8jr3mU88eqq' as Address<'J3LLYcm8V5hJRzCKENRPW3yGdQ6xU8Nie8jr3mU88eqq'>,
  } = config;
  return await getProgramDerivedAddress({
    programAddress,
    seeds: [
      getUtf8Encoder().encode('authority'),
      getAddressEncoder().encode(seeds.jellybeanMachine),
    ],
  });
}

export const resolveAuthorityPda = async ({
  accounts,
}: {
  programAddress: Address;
  accounts: Record<string, ResolvedAccount>;
}): Promise<{ value: Address }> => {
  return {
    value: (
      await findAuthorityPda({
        jellybeanMachine: expectAddress(accounts.jellybeanMachine.value),
      })
    )[0],
  };
};
