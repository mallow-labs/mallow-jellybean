// Publishes the toolchain versions pinned in the workspace `Cargo.toml` metadata
// to $GITHUB_ENV, so `.github/actions/setup` installs exactly those versions.
import { parse as parseToml } from '@iarna/toml';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const cargo = parseToml(
  readFileSync(path.join(workspaceRoot, 'Cargo.toml'), 'utf8')
);
const metadata = cargo.workspace?.metadata ?? {};

const versions = {
  ANCHOR_VERSION: metadata.cli?.anchor,
  SOLANA_VERSION: metadata.cli?.solana,
  TOOLCHAIN_FORMAT: metadata.toolchains?.format,
  TOOLCHAIN_LINT: metadata.toolchains?.lint,
  TOOLCHAIN_BUILD: metadata.toolchains?.build,
};

for (const [name, value] of Object.entries(versions)) {
  if (!value) {
    throw new Error(`${name} is not set in Cargo.toml [workspace.metadata]`);
  }
  appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}
