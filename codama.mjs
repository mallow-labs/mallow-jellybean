import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor as renderJavaScriptVisitor } from "@codama/renderers-js";
import { renderVisitor as renderUmiVisitor } from "@codama/renderers-js-umi";
import { renderVisitor as renderRustVisitor } from "@codama/renderers-rust";
import * as c from "codama";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as babelPlugin from "prettier/plugins/babel";
import * as estreePlugin from "prettier/plugins/estree";
import * as typeScriptPlugin from "prettier/plugins/typescript";
import organizeImportsPlugin from "prettier-plugin-organize-imports";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Source IDL is produced by `anchor build` (spec 0.1.0) at target/idl.
const idlPath = path.join(__dirname, "target", "idl", "mallow_jellybean.json");
const idl = JSON.parse(readFileSync(idlPath, "utf-8"));

// The Anchor IDL carries PDA seeds for `authority_pda`. Codama would turn those
// into an auto-generated `findAuthorityPdaPda`, but the umi renderer mis-exports
// it (imports from `../accounts` yet never renders a pdas module for a non-stored
// PDA). Strip the pda so both renderers fall back to the hand-written
// `resolveAuthorityPda` resolver (wired up in the default-values visitor below).
// `unclaimed_prizes` is a stored account, so its PDA renders fine and is kept.
for (const ix of idl.instructions ?? []) {
	for (const acc of ix.accounts ?? []) {
		if (acc.name === "authority_pda") delete acc.pda;
	}
}

const codama = c.createFromRoot(rootNodeFromAnchor(idl));

// Update programs.
codama.update(
	c.updateProgramsVisitor({
		mallowJellybean: { name: "mallowJellybean" },
	})
);

// Update accounts.
codama.update(
	c.updateAccountsVisitor({
		unclaimedPrizes: {
			seeds: [
				c.constantPdaSeedNodeFromString("utf8", "unclaimed_prizes"),
				c.variablePdaSeedNode("jellybeanMachine", c.publicKeyTypeNode()),
				c.variablePdaSeedNode("buyer", c.publicKeyTypeNode()),
			],
		},
	})
);

codama.update(
	c.setInstructionAccountDefaultValuesVisitor([
		{
			account: "authority",
			defaultValue: c.identityValueNode(),
			ignoreIfOptional: true,
		},
		{
			account: "mintAuthority",
			defaultValue: c.identityValueNode(),
			ignoreIfOptional: true,
		},
		{
			account: "payer",
			defaultValue: c.payerValueNode(),
			ignoreIfOptional: true,
		},
		{
			account: "unclaimedPrizes",
			defaultValue: c.pdaValueNode("unclaimedPrizes"),
			ignoreIfOptional: true,
		},
		{
			account: "authorityPda",
			defaultValue: c.resolverValueNode("resolveAuthorityPda"),
			ignoreIfOptional: true,
		},
		{
			account: "eventAuthority",
			defaultValue: c.resolverValueNode("resolveEventAuthorityPda"),
			ignoreIfOptional: true,
		},
		{
			account: /^recentSlothashes$/,
			defaultValue: c.publicKeyValueNode("SysvarS1otHashes111111111111111111111111111"),
			ignoreIfOptional: true,
		},
		{
			// Override the address-derived default (whose identifier defaults to the
			// account name) with the canonical program name registered by the mpl-core
			// umi plugin, so consumer overrides in the program repository are honored.
			// No `ignoreIfOptional` here: these accounts already carry an
			// address-derived default, which that flag would otherwise skip.
			account: "mplCoreProgram",
			defaultValue: c.publicKeyValueNode("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d", "mplCore"),
		},
		{
			// Override with the canonical program name registered by umi's system
			// program plugin, so consumer overrides in the program repository are
			// honored. See the note above re: omitting `ignoreIfOptional`.
			account: "systemProgram",
			defaultValue: c.publicKeyValueNode("11111111111111111111111111111111", "splSystem"),
		},
		{
			account: "program",
			defaultValue: c.resolverValueNode("resolveProgram"),
			ignoreIfOptional: true,
		},
	])
);

// Update instructions.
codama.update(
	c.updateInstructionsVisitor({
		addCoreItem: {
			arguments: {
				unused: {
					type: c.optionTypeNode(c.booleanTypeNode()),
					defaultValue: c.booleanValueNode(false),
					docs: "Forcing AddCoreItemInstructionExtraArgs to be rendered to fix a bug where resolvedArgs is using an undefined type",
				},
			},
		},
		draw: {
			accounts: {
				buyer: {
					defaultValue: c.identityValueNode(),
				},
			},
			arguments: {
				unused: {
					type: c.optionTypeNode(c.booleanTypeNode()),
					defaultValue: c.booleanValueNode(false),
					docs: "Forcing DrawInstructionExtraArgs to be rendered to fix a bug where resolvedArgs is using an undefined type",
				},
			},
		},
		claimCoreItem: {
			accounts: {
				buyer: {
					defaultValue: c.identityValueNode(),
				},
			},
		},
	})
);

codama.update(
	c.setStructDefaultValuesVisitor({
		settingsArgs: {
			printFeeConfig: c.noneValueNode(),
		},
	})
);

// Render JavaScript.
// renderers-js@2.x: the first arg is the package folder (where package.json
// lives) and files are written to its `src/generated` subfolder by default.
// The renderer resolves the repo `.prettierrc.json` for style, but its `plugins`
// array (organize-imports) would otherwise replace the renderer's built-in
// parser plugins, so re-supply them alongside organize-imports.
const jsClient = path.join(__dirname, "clients", "js");
codama.accept(
	renderJavaScriptVisitor(jsClient, {
		// `resolveAuthorityPda` and `resolveEventAuthorityPda` (wired up in the
		// default-values visitor above) derive PDAs via kit's async
		// `getProgramDerivedAddress`, so their generated resolvers are async.
		// Declaring them here makes the renderer emit `*Async` instruction
		// builders that await the resolver; without it the sync builder spreads a
		// pending Promise and the PDA account is left unresolved.
		asyncResolvers: ["resolveAuthorityPda", "resolveEventAuthorityPda"],
		prettierOptions: {
			plugins: [
				estreePlugin,
				typeScriptPlugin,
				babelPlugin,
				organizeImportsPlugin,
			],
		},
	})
);

// Render Umi.
const umiClient = path.join(__dirname, "clients", "umi");
codama.accept(renderUmiVisitor(path.join(umiClient, "src", "generated")));

// Render Rust (renderers-rust@3.x: first arg is the crate folder; it deletes and
// regenerates `src/generated` and leaves the hand-maintained Cargo.toml alone).
const rustClient = path.join(__dirname, "clients", "rust");
codama.accept(
	renderRustVisitor(rustClient, {
		syncCargoToml: false,
		deleteFolderBeforeRendering: true,
		formatCode: false,
		// The serde derives below pull in the `serde` and `serde_with` crates, which
		// the renderer requires versions for. Match the crate's hand-maintained
		// optional deps in clients/rust/Cargo.toml.
		dependencyVersions: {
			serde: { optional: true, version: "^1.0" },
			serde_with: { optional: true, version: "^3.0" },
		},
		traitOptions: {
			// Restore the feature-gated serde derives that the crate's `serde` feature
			// advertises. The renderer partitions these traits into a
			// `#[cfg_attr(feature = "serde", derive(...))]` line and emits the matching
			// serde_with field attributes for pubkey/byte fields.
			baseDefaults: [
				"borsh::BorshSerialize",
				"borsh::BorshDeserialize",
				"serde::Serialize",
				"serde::Deserialize",
				"Clone",
				"Debug",
				"Eq",
				"PartialEq",
			],
			featureFlags: {
				serde: ["serde::Serialize", "serde::Deserialize"],
			},
		},
	})
);

console.log("✔ Generated js, umi and rust clients from target/idl/mallow_jellybean.json");
