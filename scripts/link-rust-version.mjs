#!/usr/bin/env zx
import 'zx/globals';
import { getInstalledRustVersion, getRustVersion } from './utils.mjs';

const expectedVersion = getRustVersion();
const installedVersion = await getInstalledRustVersion();

if (!installedVersion) {
  echo(
    chalk.red('[ ERROR ]'),
    `No Rust installation found. Rust ${expectedVersion} is required for this project.`
  );
  await askToInstallRust(expectedVersion);
} else if (installedVersion === expectedVersion) {
  echo(
    chalk.green('[ SUCCESS ]'),
    `The expected Rust version ${expectedVersion} is installed and active.`
  );
} else {
  echo(
    chalk.yellow('[ WARNING ]'),
    `The active Rust version is ${installedVersion}, but this project requires ${expectedVersion}.`
  );
  await askToSetRustVersion(expectedVersion);
}

async function askToInstallRust(version) {
  const install = await question(
    `Should we install Rust ${version} using rustup? [y/N] `
  );
  if (install === 'y') {
    await $`rustup install ${version}`;
    await $`rustup override set ${version}`;
    echo(
      chalk.green('[ SUCCESS ]'),
      `Successfully installed and set Rust version ${version} for this project.`
    );
  } else {
    process.exit(1);
  }
}

async function askToSetRustVersion(version) {
  const { stdout: installedToolchains } = await $`rustup toolchain list`;
  if (installedToolchains.includes(version)) {
    const setVersion = await question(
      `Should we set the project to use Rust ${version}? [y/N] `
    );
    if (setVersion === 'y') {
      await $`rustup override set ${version}`;
      echo(
        chalk.green('[ SUCCESS ]'),
        `Successfully set Rust version ${version} for this project.`
      );
    } else {
      process.exit(1);
    }
  } else {
    await askToInstallRust(version);
  }
}
