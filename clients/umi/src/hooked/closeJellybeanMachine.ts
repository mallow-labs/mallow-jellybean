import {
  deleteGumballGuard,
  findGumballGuardPda,
} from '@mallow-labs/mallow-gumball';
import {
  Context,
  PublicKey,
  TransactionBuilder,
} from '@metaplex-foundation/umi';
import { MALLOW_JELLYBEAN_PROGRAM_ID } from '../generated';
import { findAuthorityPda } from './authorityPda';

export type CloseJellybeanMachineInput = {
  jellybeanMachine: PublicKey;
};

export const closeJellybeanMachine = (
  context: Pick<Context, 'rpc' | 'programs' | 'eddsa' | 'identity'>,
  input: CloseJellybeanMachineInput
): TransactionBuilder => {
  const { jellybeanMachine } = input;

  const gumballGuard = findGumballGuardPda(context, {
    base: jellybeanMachine,
  });

  const authorityPda = findAuthorityPda(context, {
    jellybeanMachine,
  });

  return deleteGumballGuard(context, {
    gumballGuard,
    machine: jellybeanMachine,
    authorityPda,
    machineProgram: MALLOW_JELLYBEAN_PROGRAM_ID,
  });
};
