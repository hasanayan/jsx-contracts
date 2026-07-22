// Release-workflow guard: the pushed tag must match the published version.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const tag = process.argv[2];

// Every non-private workspace package, discovered the way `pnpm -r publish`
// does, so a new published package needs no edit here.
const packagesDir = resolve(root, "packages");
const manifestPaths = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => resolve(packagesDir, entry.name, "package.json"));

for (const path of manifestPaths) {
  const {
    name,
    version,
    private: isPrivate,
  } = JSON.parse(readFileSync(path, "utf8")) as {
    name: string;
    version: string;
    private?: boolean;
  };
  if (isPrivate === true) {
    continue;
  }
  if (`v${version}` !== tag) {
    console.error(`tag ${tag ?? "(none)"} does not match ${name}@${version}`);
    process.exit(1);
  }
}
