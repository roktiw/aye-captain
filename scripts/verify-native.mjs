// Native binary smoke and negative tests; no host mutation, no credentials.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NODE_VERSION, targetFor, SOURCE_SHA_RE } from "./build-native.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function validateManifest(m, target, sourceSha) {
  if (m.schema !== "aye.sea.package/v1" ||
      m.status !== "UNSIGNED_DEVELOPER_PILOT" ||
      m.node_version !== NODE_VERSION ||
      m.source_sha !== sourceSha ||
      !SOURCE_SHA_RE.test(sourceSha) ||
      m.target !== target) {
    throw Error("MANIFEST_IDENTITY_MISMATCH");
  }
  if (!/^[a-f0-9]{64}$/.test(m.binary_sha256)) {
    throw Error("BINARY_DIGEST_INVALID");
  }
  if (!m.playbook_sha256 ||
      typeof m.playbook_sha256 !== "object" ||
      Array.isArray(m.playbook_sha256) ||
      Object.keys(m.playbook_sha256).length < 5) {
    throw Error("PLAYBOOK_MANIFEST_INVALID");
  }
  return true;
}

function run(binary, args) {
  const child = spawnSync(binary, args, {
    shell: false,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024,
    env: { PATH: "/usr/bin:/bin", HOME: process.env.RUNNER_TEMP || "/tmp", LANG: "C" }
  });
  if (child.error) throw Error("BINARY_EXEC_FAILED_" + String(child.error.code || "UNKNOWN"));
  return child;
}

function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const target = targetFor(process.platform, process.arch);
  if (target !== process.env.AYE_TARGET) throw Error("RUNNER_TARGET_MISMATCH");
  const dir = path.join(root, "dist", "aye-" + target);
  const binary = path.join(dir, "aye");
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  validateManifest(manifest, target, process.env.AYE_SOURCE_SHA);
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
    throw Error("NATIVE_ARCH_MISMATCH");
  }
  if (process.platform === "darwin" && manifest.signing !== "ad-hoc") {
    throw Error("MACOS_ADHOC_SIGNATURE_MISSING");
  }
  if (sha256(readFileSync(binary)) !== manifest.binary_sha256) {
    throw Error("BINARY_DIGEST_MISMATCH");
  }
  const expected = Object.keys(manifest.playbook_sha256).sort();
  const sidecars = path.join(dir, "share/aye/bootstrap/ansible");
  const observed = readdirSync(sidecars).sort();
  if (JSON.stringify(expected) !== JSON.stringify(observed)) {
    throw Error("PLAYBOOK_SET_MISMATCH");
  }
  for (const name of expected) {
    if (!/^[a-z][a-z0-9.-]*\.yml$/.test(name) ||
        sha256(readFileSync(path.join(sidecars, name))) !== manifest.playbook_sha256[name]) {
      throw Error("PLAYBOOK_DIGEST_MISMATCH");
    }
  }

  const help = run(binary, ["--help"]);
  if (help.status !== 0 || !help.stdout.includes("aye doctor")) {
    throw Error("HELP_SMOKE_FAILED");
  }
  const doctor = run(binary, ["doctor", "--json"]);
  let observation;
  try { observation = JSON.parse(doctor.stdout); } catch { throw Error("DOCTOR_JSON_INVALID"); }
  if (doctor.status !== 0 ||
      observation.schema !== "aye.captain.doctor/v1" ||
      observation.mode !== "read-only" ||
      observation.status !== "PASS" ||
      observation.host.os !== process.platform ||
      observation.host.arch !== process.arch ||
      observation.host.nodeVersion !== NODE_VERSION) {
    throw Error("DOCTOR_SMOKE_FAILED");
  }
  const reject = run(binary, [
    "test", "throttlio-v2", "--local", "--slot", "agent01", "--sha", "HEAD", "--json"
  ]);
  let denial;
  try { denial = JSON.parse(reject.stdout); } catch { throw Error("BAD_SHA_JSON_INVALID"); }
  if (reject.status !== 2 || denial.status !== "HOLD") {
    throw Error("BAD_SHA_NOT_REJECTED");
  }
  const evidence = {
    schema: "aye.public-native-smoke/v1",
    status: "PASS",
    source_sha: manifest.source_sha,
    binary_sha256: manifest.binary_sha256,
    target,
    doctor: "PASS",
    invalid_sha: "DENIED",
    host_mutation: false,
    build_runtime: NODE_VERSION,
    notarized: false
  };
  writeFileSync(path.join(dir, "smoke.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) {
    console.error(e instanceof Error ? e.message : "NATIVE_SMOKE_FAILED");
    process.exitCode = 1;
  }
}
