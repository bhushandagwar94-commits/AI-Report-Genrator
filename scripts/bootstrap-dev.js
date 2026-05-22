import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = resolve(root, "server");

function platformCommand(command) {
  if (process.platform !== "win32") return command;
  if (["yarn", "npx"].includes(command)) return `${command}.cmd`;
  return command;
}

function run(command, args, options = {}) {
  console.log(`\n> Running: ${command} ${args.join(" ")}`);
  const result = spawnSync(platformCommand(command), args, {
    cwd: options.cwd || root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}`
    );
  }
}

function assertNodeVersion() {
  const minimumMajor = 20;
  const currentMajor = Number(process.versions.node.split(".")[0]);
  if (!Number.isFinite(currentMajor) || currentMajor < minimumMajor) {
    throw new Error(
      `Node.js ${minimumMajor}+ is required. Current version is ${process.versions.node}.`
    );
  }
}

function dependenciesInstalled() {
  return ["node_modules", "server/node_modules", "frontend/node_modules"].every(
    (folder) => existsSync(resolve(root, folder))
  );
}

console.log("=== Bootstrapping AI Report Generator ===");

assertNodeVersion();

if (!dependenciesInstalled()) {
  console.log("Dependencies are missing. Please run `yarn install` first.");
  process.exit(1);
}

console.log("\n[1/3] Generating Prisma client...");
run("npx", ["prisma", "generate"], { cwd: serverDir });

console.log("\n[2/3] Setting up database and running migrations...");
run("npx", ["prisma", "migrate", "dev", "--name", "init"], { cwd: serverDir });

console.log("\n[3/3] Seeding AI Report Generator setup state...");
// This will invoke ensureAiReportGeneratorSeeded from server/utils/aiReportGeneratorSeed.js
// which will set onboarding_complete=true and create the commercial template
run("npx", ["prisma", "db", "seed"], { cwd: serverDir });

console.log("\n=== Bootstrap Complete! ===");
console.log("The AI Report Generator state is successfully configured.");
console.log("You can now run `yarn dev:all` and it will skip the setup UI.");
