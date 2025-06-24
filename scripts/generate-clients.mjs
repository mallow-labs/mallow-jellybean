#!/usr/bin/env zx
import 'zx/globals';
import * as c from 'codama';
import { rootNodeFromAnchor } from '@codama/nodes-from-anchor';
import { renderVisitor as renderJavaScriptVisitor } from '@codama/renderers-js';
import { renderVisitor as renderUmiVisitor } from '@codama/renderers-js-umi';
import { renderVisitor as renderRustVisitor } from '@codama/renderers-rust';
import { getAllProgramIdls } from './utils.mjs';

// Instanciate Codama.
const [idl, ...additionalIdls] = getAllProgramIdls().map((idl) =>
  rootNodeFromAnchor(require(idl))
);
const codama = c.createFromRoot(idl, additionalIdls);

// Update programs.
codama.update(
  c.updateProgramsVisitor({
    mallowJellybean: { name: 'mallowJellybean' },
  })
);

// Update accounts.
codama.update(
  c.updateAccountsVisitor({
    unclaimedPrizes: {
      seeds: [
        c.constantPdaSeedNodeFromString('utf8', 'unclaimed_prizes'),
        c.variablePdaSeedNode('jellybeanMachine', c.publicKeyTypeNode()),
        c.variablePdaSeedNode('buyer', c.publicKeyTypeNode()),
      ],
    },
  })
);

codama.update(
  c.setInstructionAccountDefaultValuesVisitor([
    {
      account: 'authority',
      defaultValue: c.identityValueNode(),
    },
    {
      account: 'payer',
      defaultValue: c.payerValueNode(),
    },
    {
      account: 'unclaimedPrizes',
      defaultValue: c.pdaValueNode('unclaimedPrizes'),
    },
    {
      account: 'authorityPda',
      defaultValue: c.resolverValueNode('resolveAuthorityPda'),
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
          docs: 'Forcing AddCoreItemInstructionExtraArgs to be rendered to fix a bug where resolvedArgs is using an undefined type',
        },
      },
    },
  })
);

// Render JavaScript.
const jsClient = path.join(__dirname, '..', 'clients', 'js');
codama.accept(
  renderJavaScriptVisitor(path.join(jsClient, 'src', 'generated'), {
    prettierOptions: require(path.join(jsClient, '.prettierrc.json')),
  })
);

// Render JavaScript.
const umiClient = path.join(__dirname, '..', 'clients', 'umi');
codama.accept(
  renderUmiVisitor(path.join(umiClient, 'src', 'generated'), {
    prettierOptions: require(path.join(umiClient, '.prettierrc.json')),
  })
);

// Render Rust.
const rustClient = path.join(__dirname, '..', 'clients', 'rust');
codama.accept(
  renderRustVisitor(path.join(rustClient, 'src', 'generated'), {
    formatCode: true,
    crateFolder: rustClient,
  })
);
