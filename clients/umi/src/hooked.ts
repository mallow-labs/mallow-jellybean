import { Context, Pda, PublicKey } from "@metaplex-foundation/umi";
import { publicKey as publicKeySerializer, string } from "@metaplex-foundation/umi/serializers";
import { expectPublicKey, ResolvedAccount } from "./generated";

export function findJellybeanMachineAuthorityPda(
	context: Pick<Context, "eddsa" | "programs">,
	seeds: {
		/** The Jellybean Machine address */
		jellybeanMachine: PublicKey;
	},
): Pda {
	const programId = context.programs.get("mallowJellybean").publicKey;
	return context.eddsa.findPda(programId, [
		string({ size: "variable" }).serialize("jellybean_machine"),
		publicKeySerializer().serialize(seeds.jellybeanMachine),
	]);
}

export const resolveAuthorityPda = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	_args?: Record<string, unknown>,
	_programId?: PublicKey,
	_isWritable?: boolean,
): { value: Pda | null } => ({
	value: findJellybeanMachineAuthorityPda(context, {
		jellybeanMachine: expectPublicKey(accounts.jellybeanMachine.value),
	}),
});
