// The published set is every non-private workspace package, the way
// `pnpm -r publish` discovers it — a new package is picked up automatically.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export function publishedManifestPaths(): string[] {
  const packagesDir = resolve(root, "packages");
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(packagesDir, entry.name, "package.json"))
    .filter((path) => {
      const { private: isPrivate } = JSON.parse(readFileSync(path, "utf8")) as {
        private?: boolean;
      };
      return isPrivate !== true;
    })
    .sort();
}
