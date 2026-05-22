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
  const result = spawnSync(platformCommand(command), args, {
    cwd: options.cwd || root,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function runYarn(args) {
  try {
    run("yarn", args);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    console.log("Yarn was not found on PATH. Falling back to Corepack.");
    run("corepack", ["yarn", ...args]);
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
  return ["node_modules", "server/node_modules", "frontend/node_modules", "collector/node_modules"]
    .every((folder) => existsSync(resolve(root, folder)));
}

console.log("Setting up AI Report Generator development environment...");

assertNodeVersion();

if (!dependenciesInstalled()) {
  console.log("Dependencies are missing. Running yarn install...");
  runYarn(["install"]);
} else {
  console.log("Dependencies found. Skipping yarn install.");
}

run("node", ["scripts/setup-envs.js"]);
run("npx", ["prisma", "migrate", "dev"], { cwd: serverDir });
run("npx", ["prisma", "generate"], { cwd: serverDir });
run("npx", ["prisma", "db", "seed"], { cwd: serverDir });

console.log("Development setup complete.");
console.log("Run `yarn dev:all` and open http://localhost:3000/.");
