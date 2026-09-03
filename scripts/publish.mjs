#!/usr/bin/env node
/**
 * Publishes through changesets, unless the registry already has this version.
 *
 * `changeset publish` decides what to publish by asking npm what exists. The
 * registry is eventually consistent, so a release run that starts shortly after
 * a successful publish can be told the version is missing and try again. npm
 * then rejects the duplicate with an E403 carrying no `summary` field, and
 * changesets throws while classifying it:
 *
 *   TypeError: Cannot read properties of undefined (reading 'includes')
 *     at isAlreadyPublishedError (@changesets/cli/dist/changesets-cli.cjs.js:873)
 *
 * That path is meant to be the graceful one — its own log line calls it "stale
 * registry data led to a duplicate publish attempt" — but it assumes an npm
 * error shape that no longer holds. Checking first keeps us out of it, and is
 * the right behaviour regardless: publishing is not something to retry blindly.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));

/** Whether the registry already serves this exact version. */
async function alreadyPublished() {
  const response = await fetch(`https://registry.npmjs.org/${name}/${version}`);

  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    // Cannot tell. Let changesets decide rather than skip a real release.
    console.warn(
      `Could not reach the registry (HTTP ${response.status}); deferring to changeset publish.`,
    );
    return false;
  }
  return true;
}

if (await alreadyPublished()) {
  console.log(`${name}@${version} is already on npm; nothing to publish.`);
  process.exit(0);
}

execFileSync("pnpm", ["exec", "changeset", "publish"], { stdio: "inherit" });
