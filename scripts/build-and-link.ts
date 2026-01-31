#!/usr/bin/env bun

import { $ } from "bun";
import { existsSync, lstatSync, readlinkSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

const projectRoot = resolve(import.meta.dir, "..");
const distFile = join(projectRoot, "dist", "index.js");
const pluginsDir = join(homedir(), ".config", "opencode", "plugins");
const linkPath = join(pluginsDir, "claude-code-provider.js");

async function main() {
  console.log("Building plugin and SDK wrapper...");
  await $`bun run build`.cwd(projectRoot);
  console.log("✓ Build complete\n");

  console.log("Linking npm package globally...");
  await $`npm link`.cwd(projectRoot);
  console.log("✓ Package linked as 'opencode-claude-code-provider'\n");

  console.log("Setting up plugin symlink...");
  await $`mkdir -p ${pluginsDir}`;

  if (existsSync(linkPath)) {
    const stats = lstatSync(linkPath);
    if (stats.isSymbolicLink()) {
      const currentTarget = readlinkSync(linkPath);
      if (currentTarget === distFile) {
        console.log("✓ Symlink already correct");
      } else {
        unlinkSync(linkPath);
        await $`ln -s ${distFile} ${linkPath}`;
        console.log("✓ Symlink updated");
      }
    } else {
      unlinkSync(linkPath);
      await $`ln -s ${distFile} ${linkPath}`;
      console.log("✓ Symlink created");
    }
  } else {
    await $`ln -s ${distFile} ${linkPath}`;
    console.log("✓ Symlink created");
  }

  console.log(`  ${linkPath}`);
  console.log(`  -> ${distFile}\n`);
  console.log("Restart OpenCode to load the plugin.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
