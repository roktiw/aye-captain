// Resolve one protected GitLab source revision and its current CI gate.
// This runs only on workflow_dispatch; it does not fetch private source files.
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://gitlab.com/api/v4/projects/89070685";
const SHA = /^[a-f0-9]{40}$/;

export function validateSha(value) {
  if (!SHA.test(value)) throw Error("SOURCE_SHA_INVALID");
  return value;
}

export function selectSourceSha(branch, requested = "") {
  if (!branch || branch.name !== "main" || branch.protected !== true) {
    throw Error("SOURCE_BRANCH_NOT_PROTECTED");
  }
  return validateSha(requested || branch.commit?.id || "");
}

export function requireSuccessfulPipeline(pipelines, sha) {
  if (!Array.isArray(pipelines) || pipelines.length === 0) {
    throw Error("SOURCE_PIPELINE_NOT_FOUND");
  }
  const latest = pipelines[0];
  if (latest.sha !== sha || latest.ref !== "main" || latest.status !== "success") {
    throw Error("SOURCE_PIPELINE_NOT_GREEN");
  }
  if (!Number.isSafeInteger(latest.id) || latest.id <= 0) {
    throw Error("SOURCE_PIPELINE_ID_INVALID");
  }
  return latest.id;
}

async function apiGet(endpoint, token) {
  const response = await fetch(API + endpoint, {
    headers: { "PRIVATE-TOKEN": token, Accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw Error("GITLAB_API_STATUS_" + response.status);
  return response.json();
}

async function main() {
  const token = process.env.GITLAB_READ_TOKEN;
  if (!token) throw Error("GITLAB_READ_TOKEN_MISSING");
  const requested = (process.env.REQUESTED_GITLAB_SHA || "").trim();
  if (requested) validateSha(requested);
  const branch = await apiGet("/repository/branches/main", token);
  const sha = selectSourceSha(branch, requested);
  const pipelines = await apiGet(
    "/pipelines?ref=main&sha=" + sha + "&order_by=id&sort=desc&per_page=1",
    token
  );
  const pipelineId = requireSuccessfulPipeline(pipelines, sha);
  if (!process.env.GITHUB_OUTPUT) throw Error("GITHUB_OUTPUT_MISSING");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    "source_sha=" + sha + "\npipeline_id=" + pipelineId + "\n"
  );
  console.log("Admitted GitLab SHA " + sha + " with successful pipeline " + pipelineId);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "SOURCE_RESOLUTION_FAILED");
    process.exitCode = 1;
  });
}
