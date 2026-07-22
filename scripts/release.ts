// Usage: pnpm release <major|minor|patch>
// Bumps the published packages in lockstep, commits, and tags vX.Y.Z. Does not
// push; the push command is printed at the end.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// The published set is every non-private workspace package, the way
// `pnpm -r publish` discovers it — a new package is picked up automatically.
const publishedManifestPaths = (): string[] => {
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
};

const manifestPaths = publishedManifestPaths();

const bump = process.argv[2];
if (bump !== "major" && bump !== "minor" && bump !== "patch") {
  console.error("usage: pnpm release <major|minor|patch>");
  process.exit(1);
}

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

if (git("status", "--porcelain") !== "") {
  console.error(
    "working tree is dirty — commit or stash first, the release commit must contain only the version bump",
  );
  process.exit(1);
}

const packages = manifestPaths.map((path) => ({
  path,
  manifest: JSON.parse(readFileSync(path, "utf8")) as { version: string },
}));

const versions = new Set(packages.map((p) => p.manifest.version));
if (versions.size !== 1) {
  console.error(`versions have drifted: ${[...versions].join(", ")}`);
  process.exit(1);
}

const [major = 0, minor = 0, patch = 0] = [...versions][0]!
  .split(".")
  .map(Number);
const next =
  bump === "major"
    ? `${major + 1}.0.0`
    : bump === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

for (const { path, manifest } of packages) {
  manifest.version = next;
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
}

const tag = `v${next}`;
git("add", ...packages.map((p) => p.path));
git("commit", "-m", tag);
git("tag", tag);

console.log(`committed and tagged ${tag} — publish with:`);
console.log(`  git push origin main ${tag}`);
