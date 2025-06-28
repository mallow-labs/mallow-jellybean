import {
  createGumballGuard,
  CreateGumballGuardInstructionDataArgs,
  DefaultGuardSetArgs,
  findGumballGuardPda,
  GuardRepository,
  GuardSetArgs,
  wrap,
} from '@mallow-labs/mallow-gumball';
import {
  Context,
  transactionBuilder,
  TransactionBuilder,
} from '@metaplex-foundation/umi';
import { createJellybeanMachine } from './createJellybeanMachine';

export type CreateInput<DA extends GuardSetArgs = DefaultGuardSetArgs> =
  Parameters<typeof createJellybeanMachine>[1] &
    CreateGumballGuardInstructionDataArgs<DA>;

export const create = async <DA extends GuardSetArgs = DefaultGuardSetArgs>(
  context: Parameters<typeof createJellybeanMachine>[0] &
    Pick<Context, 'eddsa'> & {
      guards: GuardRepository;
    },
  input: CreateInput<DA extends undefined ? DefaultGuardSetArgs : DA>
): Promise<TransactionBuilder> => {
  const { guards, groups, ...rest } = input;
  const gumballGuard = findGumballGuardPda(context, {
    base: input.jellybeanMachine.publicKey,
  });

  return transactionBuilder()
    .add(await createJellybeanMachine(context, rest))
    .add(
      createGumballGuard(context, {
        base: input.jellybeanMachine,
        guards,
        groups,
      })
    )
    .add(
      wrap(context, {
        gumballGuard,
        machine: input.jellybeanMachine.publicKey,
        machineProgram: context.programs.get('mallowJellybean').publicKey,
      })
    );
};
