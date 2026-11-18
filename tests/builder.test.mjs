import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSha, selectSourceSha, requireSuccessfulPipeline
} from "../scripts/resolve-source.mjs";
import {
  NODE_VERSION, targetFor, requireReleaseContext
} from "../scripts/build-native.mjs";
import { validateManifest } from "../scripts/verify-native.mjs";

const sha = "a".repeat(40);
const branch = { name: "main", protected: true, commit: { id: sha } };
const green = [{ id: 123, sha, ref: "main", status: "success" }];

test("GitLab source is exactly a 40-character SHA", () => {
  assert.equal(validateSha(sha), sha);
  for (const value of ["main", "HEAD", "../main", "A".repeat(40), "a".repeat(39)]) {
    assert.throws(() => validateSha(value), /SOURCE_SHA_INVALID/);
  }
});
test("source must come from protected main", () => {
  assert.equal(selectSourceSha(branch), sha);
  assert.equal(selectSourceSha(branch, sha), sha);
  assert.throws(() => selectSourceSha({ ...branch, protected: false }), /NOT_PROTECTED/);
  assert.throws(() => selectSourceSha({ ...branch, name: "feature" }), /NOT_PROTECTED/);
});
test("only current green CI for exact SHA is admitted", () => {
  assert.equal(requireSuccessfulPipeline(green, sha), 123);
  assert.throws(() => requireSuccessfulPipeline([], sha), /NOT_FOUND/);
  assert.throws(() => requireSuccessfulPipeline([{ ...green[0], status: "running" }], sha), /NOT_GREEN/);
  assert.throws(() => requireSuccessfulPipeline([{ ...green[0], sha: "b".repeat(40) }], sha), /NOT_GREEN/);
  assert.throws(() => requireSuccessfulPipeline([{ ...green[0], ref: "feature" }], sha), /NOT_GREEN/);
});
test("only supported native platform/arch tuples are accepted", () => {
  assert.equal(targetFor("linux", "x64"), "linux-x64");
  assert.equal(targetFor("linux", "arm64"), "linux-arm64");
  assert.equal(targetFor("darwin", "arm64"), "macos-arm64");
  assert.throws(() => targetFor("darwin", "x64"), /UNSUPPORTED_NATIVE_TARGET/);
  assert.throws(() => targetFor("win32", "x64"), /UNSUPPORTED_NATIVE_TARGET/);
});
test("build context fails closed for wrong SHA, runtime and runner", () => {
  const context = {
    nodeVersion: NODE_VERSION, sourceSha: sha, pipelineId: 123,
    platform: "linux", arch: "x64", target: "linux-x64"
  };
  assert.equal(requireReleaseContext(context), "linux-x64");
  assert.throws(() => requireReleaseContext({ ...context, nodeVersion: "22.16.0" }), /NODE_VERSION_MISMATCH/);
  assert.throws(() => requireReleaseContext({ ...context, target: "linux-arm64" }), /RUNNER_TARGET_MISMATCH/);
  assert.throws(() => requireReleaseContext({ ...context, sourceSha: "HEAD" }), /SOURCE_SHA_INVALID/);
  assert.throws(() => requireReleaseContext({ ...context, pipelineId: 0 }), /SOURCE_PIPELINE_ID_INVALID/);
});
test("artifact manifest rejects incorrect source, status and missing playbooks", () => {
  const manifest = {
    schema: "aye.sea.package/v1", status: "UNSIGNED_DEVELOPER_PILOT",
    node_version: NODE_VERSION, source_sha: sha, target: "linux-x64",
    binary_sha256: "f".repeat(64),
    playbook_sha256: { "a.yml": sha, "b.yml": sha, "c.yml": sha, "d.yml": sha, "e.yml": sha }
  };
  assert.equal(validateManifest(manifest, "linux-x64", sha), true);
  assert.throws(() => validateManifest({ ...manifest, source_sha: "b".repeat(40) }, "linux-x64", sha), /IDENTITY_MISMATCH/);
  assert.throws(() => validateManifest({ ...manifest, status: "RELEASE" }, "linux-x64", sha), /IDENTITY_MISMATCH/);
  assert.throws(() => validateManifest({ ...manifest, playbook_sha256: {} }, "linux-x64", sha), /PLAYBOOK_MANIFEST_INVALID/);
});
