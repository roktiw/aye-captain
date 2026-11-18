// Native Node 26 SEA builder. Reuses canonical GitLab source asset planning.
// This public builder NEVER implements AYE CLI logic or accepts arbitrary shell.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync,
  mkdtempSync, readFileSync, rmSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const NODE_VERSION = "26.13.1";
export const SOURCE_SHA_RE = /^[a-f0-9]{40}$/;

export function targetFor(platform, arch) {
  const matrix = {
    linux: { x64: "linux-x64", arm64: "linux-arm64" },
    darwin: { arm64: "macos-arm64" }
  };
  const target = matrix[platform]?.[arch];
  if (!target) throw Error("UNSUPPORTED_NATIVE_TARGET");
  return target;
}

export function requireReleaseContext(context) {
  if (context.nodeVersion !== NODE_VERSION) throw Error("NODE_VERSION_MISMATCH");
  if (!SOURCE_SHA_RE.test(context.sourceSha || "")) throw Error("SOURCE_SHA_INVALID");
  if (!Number.isSafeInteger(Number(context.pipelineId)) || Number(context.pipelineId) < 1) {
    throw Error("SOURCE_PIPELINE_ID_INVALID");
  }
  const actualTarget = targetFor(context.platform, context.arch);
  if (actualTarget !== context.target) throw Error("RUNNER_TARGET_MISMATCH");
  return actualTarget;
}

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function run(command, args, options = {}) {
  const child = spawnSync(command, args, {
    shell: false,
    stdio: "inherit",
    timeout: 300000,
    ...options
  });
  if (child.error || child.status !== 0) throw Error("NATIVE_BUILD_SUBPROCESS_FAILED_" + command);
}

async function main() {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const source = path.join(projectRoot, ".private-gitlab-src");
  const target = requireReleaseContext({
    nodeVersion: process.versions.node,
    sourceSha: process.env.AYE_SOURCE_SHA,
    pipelineId: process.env.AYE_PIPELINE_ID,
    platform: process.platform,
    arch: process.arch,
    target: process.env.AYE_TARGET
  });

  if (!existsSync(source) || !lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) {
    throw Error("CANONICAL_SOURCE_MISSING_OR_UNTRUSTED");
  }
  const outputDir = path.join(projectRoot, "dist", "aye-" + target);
  if (existsSync(outputDir)) throw Error("OUTPUT_ALREADY_EXISTS");

  const imported = await import(
    pathToFileURL(path.join(source, "scripts/build-aye-sea.mjs")).href
  );
  if (imported.RUNTIME_VERSION !== NODE_VERSION ||
      typeof imported.createSeaAssetPlan !== "function") {
    throw Error("CANONICAL_SEA_PLAN_INCOMPATIBLE");
  }

  const stage = mkdtempSync(path.join(tmpdir(), "aye-native-sea-"));
  try {
    // The canonical builder rejects symlinks, duplicate assets and unrecognized source files.
    const plan = imported.createSeaAssetPlan(source, stage);
    mkdirSync(outputDir, { recursive: true });
    const sidecarDest = path.join(outputDir, "share/aye/bootstrap/ansible");
    mkdirSync(sidecarDest, { recursive: true });
    for (const filename of Object.keys(plan.playbookDigests).sort()) {
      if (!/^[a-z][a-z0-9.-]*\.yml$/.test(filename)) {
        throw Error("UNTRUSTED_PLAYBOOK_NAME");
      }
      const from = path.join(source, "bootstrap/ansible", filename);
      const to = path.join(sidecarDest, filename);
      copyFileSync(from, to);
      chmodSync(to, 0o644);
      if (digest(readFileSync(to)) !== plan.playbookDigests[filename]) {
        throw Error("PLAYBOOK_COPY_INTEGRITY_FAILED");
      }
    }

    const binary = path.join(outputDir, "aye");
    const config = {
      main: plan.sourceMain,
      mainFormat: "module",
      output: binary,
      useVfs: true,
      useCodeCache: false,
      useSnapshot: false,
      disableExperimentalSEAWarning: true,
      execArgvExtension: "none",
      assets: Object.fromEntries(
        Object.entries(plan.assets).sort(([a], [b]) => a.localeCompare(b))
      )
    };
    const cfg = path.join(stage, "sea-config.json");
    writeFileSync(cfg, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    run(process.execPath, ["--build-sea", cfg]);
    chmodSync(binary, 0o755);

    let signing = "none";
    if (process.platform === "darwin") {
      run("/usr/bin/codesign", ["--force", "--sign", "-", binary]);
      signing = "ad-hoc";
    }

    const manifest = {
      schema: "aye.sea.package/v1",
      status: "UNSIGNED_DEVELOPER_PILOT",
      source_repo: "gitlab.com/roktiw/aye-captain",
      source_sha: process.env.AYE_SOURCE_SHA,
      source_pipeline_id: Number(process.env.AYE_PIPELINE_ID),
      target,
      node_version: NODE_VERSION,
      platform: process.platform,
      arch: process.arch,
      signing,
      notarized: false,
      binary_sha256: digest(readFileSync(binary)),
      playbook_sha256: plan.playbookDigests,
      asset_count: Object.keys(plan.assets).length
    };
    writeFileSync(
      path.join(outputDir, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { flag: "wx", mode: 0o644 }
    );
    console.log("AYE_NATIVE_BUILD_OK " + target + " " + manifest.binary_sha256);
  } catch (error) {
    rmSync(outputDir, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "NATIVE_BUILD_FAILED");
    process.exitCode = 1;
  });
}
