import { constants, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFiles = [
  [".env.example", ".env"],
  ["frontend/.env.example", "frontend/.env"],
  ["server/.env.example", "server/.env"],
  ["server/.env.example", "server/.env.development"],
  ["collector/.env.example", "collector/.env"],
  ["docker/.env.example", "docker/.env"],
];

for (const [source, destination] of envFiles) {
  const sourcePath = resolve(root, source);
  const destinationPath = resolve(root, destination);

  if (!existsSync(sourcePath)) {
    console.warn(`Skipped ${destination}: missing ${source}`);
    continue;
  }

  try {
    copyFileSync(sourcePath, destinationPath, constants.COPYFILE_EXCL);
    console.log(`Created ${destination}`);
  } catch (error) {
    if (error.code === "EEXIST") {
      console.log(`Kept existing ${destination}`);
      continue;
    }

    throw error;
  }
}

console.log("All ENV files are ready.");
