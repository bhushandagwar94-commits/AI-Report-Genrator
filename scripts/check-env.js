import { execSync } from "node:child_process";

const minimumNodeMajor = 20;
const currentNodeVersion = process.versions.node;
const currentNodeMajor = Number(currentNodeVersion.split(".")[0]);

if (!Number.isFinite(currentNodeMajor) || currentNodeMajor < minimumNodeMajor) {
  console.error(
    `Environment check failed: Node.js ${minimumNodeMajor}+ is required. Current version is ${currentNodeVersion}.`
  );
  console.error("Install Node.js 20 or higher, then run yarn install again.");
  process.exit(1);
}

try {
  const yarnVersion = execSync("yarn -v", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  console.log(
    `Environment OK: Node.js ${currentNodeVersion} and Yarn ${yarnVersion} are available.`
  );
} catch (error) {
  console.error("Environment check failed: Yarn is not available on PATH.");
  console.error("Install Yarn 1.22.x, then run yarn install again.");
  process.exit(1);
}
