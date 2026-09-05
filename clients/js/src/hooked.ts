import {
  Address,
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  ProgramDerivedAddress,
} from '@solana/kit';
import {
  getAddressFromResolvedInstructionAccount,
  ResolvedInstructionAccount,
} from '@solana/program-client-core';

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
      getUtf8Encoder().encode('jellybean_machine'),
      getAddressEncoder().encode(seeds.jellybeanMachine),
    ],
  });
}

export const resolveAuthorityPda = async ({
  accounts,
}: {
  programAddress: Address;
  accounts: Record<string, ResolvedInstructionAccount>;
}): Promise<{ value: Address }> => {
  return {
    value: (
      await findAuthorityPda({
        jellybeanMachine: getAddressFromResolvedInstructionAccount(
          'jellybeanMachine',
          accounts.jellybeanMachine.value
        ),
      })
    )[0],
  };
};

export const resolveEventAuthorityPda = async ({
  programAddress,
}: {
  programAddress: Address;
  accounts: Record<string, ResolvedInstructionAccount>;
}): Promise<{ value: Address }> => {
  return {
    value: (
      await getProgramDerivedAddress({
        programAddress,
        seeds: [getUtf8Encoder().encode('__event_authority')],
      })
    )[0],
  };
};

export const resolveProgram = ({
  programAddress,
}: {
  programAddress: Address;
  accounts: Record<string, ResolvedInstructionAccount>;
}): { value: Address } => {
  return {
    value: programAddress,
  };
};
