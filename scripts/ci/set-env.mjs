// Publishes the pinned toolchain versions to $GITHUB_ENV, so
// `.github/actions/setup` installs exactly those versions.
//
// The Anchor and Solana CLI versions come from `Anchor.toml [toolchain]`, the
// same key the `anchor` CLI honours locally. Keeping CI on that one source stops
// it installing a CLI the local build would refuse to run. The Rust toolchains
// have no Anchor.toml equivalent, so they stay in the `Cargo.toml` metadata.
import { parse as parseToml } from '@iarna/toml';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const readToml = (file) =>
  parseToml(readFileSync(path.join(workspaceRoot, file), 'utf8'));

const toolchain = readToml('Anchor.toml').toolchain ?? {};
const toolchains = readToml('Cargo.toml').workspace?.metadata?.toolchains ?? {};

const ANCHOR_SOURCE = 'Anchor.toml [toolchain]';
const CARGO_SOURCE = 'Cargo.toml [workspace.metadata.toolchains]';

const versions = {
  ANCHOR_VERSION: [toolchain.anchor_version, ANCHOR_SOURCE],
  SOLANA_VERSION: [toolchain.solana_version, ANCHOR_SOURCE],
  TOOLCHAIN_FORMAT: [toolchains.format, CARGO_SOURCE],
  TOOLCHAIN_LINT: [toolchains.lint, CARGO_SOURCE],
  TOOLCHAIN_BUILD: [toolchains.build, CARGO_SOURCE],
};

for (const [name, [value, source]] of Object.entries(versions)) {
  if (!value) {
    throw new Error(`${name} is not set in ${source}`);
  }
  appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}
