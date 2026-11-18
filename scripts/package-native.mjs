// Archive only verified native binary, manifest, smoke evidence and playbooks.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { targetFor, SOURCE_SHA_RE } from "./build-native.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const target = targetFor(process.platform, process.arch);
  if (target !== process.env.AYE_TARGET ||
      !SOURCE_SHA_RE.test(process.env.AYE_SOURCE_SHA || "")) {
    throw Error("RELEASE_TARGET_OR_SHA_MISMATCH");
  }
  const inputDir = path.join(root, "dist", "aye-" + target);
  const manifest = JSON.parse(readFileSync(path.join(inputDir, "manifest.json"), "utf8"));
  const smoke = JSON.parse(readFileSync(path.join(inputDir, "smoke.json"), "utf8"));
  if (smoke.status !== "PASS" ||
      smoke.source_sha !== manifest.source_sha ||
      manifest.source_sha !== process.env.AYE_SOURCE_SHA ||
      sha256(readFileSync(path.join(inputDir, "aye"))) !== manifest.binary_sha256) {
    throw Error("RELEASE_REQUIRES_VERIFIED_SEA");
  }
  const sidecars = path.join(inputDir, "share/aye/bootstrap/ansible");
  if (!existsSync(sidecars)) throw Error("RELEASE_PLAYBOOKS_MISSING");
  const outDir = path.join(root, "release", target);
  mkdirSync(outDir, { recursive: true });
  const name = "aye-" + target + "-" + manifest.source_sha.slice(0, 12) + ".tar.gz";
  const archive = path.join(outDir, name);
  if (existsSync(archive)) throw Error("RELEASE_ARCHIVE_ALREADY_EXISTS");
  const child = spawnSync(
    "tar",
    ["-C", inputDir, "-czf", archive, "aye", "manifest.json", "smoke.json", "share"],
    { shell: false, stdio: "inherit", timeout: 300000 }
  );
  if (child.error || child.status !== 0) throw Error("NATIVE_ARCHIVE_FAILED");
  const digest = sha256(readFileSync(archive));
  writeFileSync(path.join(outDir, "SHA256SUMS"), digest + "  " + name + "\n", {
    flag: "wx", mode: 0o644
  });
  console.log("NATIVE_ARTIFACT_READY " + name + " " + digest);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) {
    console.error(e instanceof Error ? e.message : "NATIVE_PACKAGE_FAILED");
    process.exitCode = 1;
  }
}
