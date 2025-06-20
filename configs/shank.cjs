const path = require("path");
const { generateIdl } = require("@metaplex-foundation/shank-js");

const idlDir = path.join(__dirname, "..", "idls");
const binaryInstallDir = path.join(__dirname, "..", ".crates");
const programDir = path.join(__dirname, "..", "programs");

generateIdl({
	generator: "anchor",
	programName: "mallow_jellybean",
	programId: "J3LLYcm8V5hJRzCKENRPW3yGdQ6xU8Nie8jr3mU88eqq",
	idlDir,
	binaryInstallDir,
	programDir: path.join(programDir, "mallow-jellybean", "program"),
	rustbin: {
		locked: true,
		versionRangeFallback: "0.27.0",
	},
});
