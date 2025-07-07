import {
  addressGateGuardManifest,
  allocationGuardManifest,
  allowListGuardManifest,
  botTaxGuardManifest,
  createGumballGuardProgram,
  DefaultGuardRepository,
  defaultGumballGuardNames,
  endDateGuardManifest,
  gatekeeperGuardManifest,
  GuardRepository,
  GumballGuardProgram,
  mintLimitGuardManifest,
  nftBurnGuardManifest,
  nftGateGuardManifest,
  nftPaymentGuardManifest,
  programGateGuardManifest,
  redeemedAmountGuardManifest,
  solPaymentGuardManifest,
  startDateGuardManifest,
  thirdPartySignerGuardManifest,
  token2022PaymentGuardManifest,
  tokenBurnGuardManifest,
  tokenGateGuardManifest,
  tokenPaymentGuardManifest,
} from '@mallow-labs/mallow-gumball';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { UmiPlugin } from '@metaplex-foundation/umi';
import { createMallowJellybeanProgram } from './generated/programs';

export const mallowJellybean = (): UmiPlugin => ({
  install(umi) {
    umi.use(mplToolbox());
    umi.use(mplCore());

    // Programs.
    umi.programs.add(createMallowJellybeanProgram(), false);

    umi.programs.add(
      {
        ...createGumballGuardProgram(),
        availableGuards: defaultGumballGuardNames,
      } as GumballGuardProgram,
      false
    );

    // Default Guards.
    umi.guards = new DefaultGuardRepository();
    umi.guards.add(
      botTaxGuardManifest,
      startDateGuardManifest,
      solPaymentGuardManifest,
      tokenPaymentGuardManifest,
      thirdPartySignerGuardManifest,
      tokenGateGuardManifest,
      gatekeeperGuardManifest,
      endDateGuardManifest,
      allowListGuardManifest,
      mintLimitGuardManifest,
      nftPaymentGuardManifest,
      redeemedAmountGuardManifest,
      addressGateGuardManifest,
      nftGateGuardManifest,
      nftBurnGuardManifest,
      tokenBurnGuardManifest,
      programGateGuardManifest,
      allocationGuardManifest,
      token2022PaymentGuardManifest
    );
  },
});

declare module '@metaplex-foundation/umi' {
  interface Umi {
    guards: GuardRepository;
  }
}
