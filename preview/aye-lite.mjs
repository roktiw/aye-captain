#!/usr/bin/env node
// AYE Captain minimal macOS preview. Does NOT contain canonical private GitLab CLI.
import os from "node:os";
import { spawnSync } from "node:child_process";
const VERSION = "0.1.0-macos-preview.20261118";
const names = Object.freeze({
  git: ["--version"], ssh: ["-V"], docker: ["--version"],
  glab: ["--version"], brew: ["--version"], tailscale: ["version"]
});
function toolStatus(name, args) {
  try {
    const p = spawnSync(name, args, {
      shell: false, encoding: "utf8", timeout: 2000,
      stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16384
    });
    return {
      available: !p.error && p.status === 0,
      version: !p.error && p.status === 0
        ? ((p.stdout || p.stderr || "").split("\n")[0].trim()).slice(0, 180)
        : null
    };
  } catch { return { available: false, version: null }; }
}
const guidance = `AYE Captain macOS CLI PREVIEW — ${VERSION}
Usage:
  aye doctor [--json]  Read-only host and developer-tool inventory
  aye status [--json]  Show local preview capabilities
  aye setup --plan    Print read-only starter setup suggestions
  aye version         Display preview version
  aye --help          Display this help

This is an independent, limited preview, not the full GitLab AYE Captain.
No daemon, no MCP, no GitLab connection, no provisioning, no telemetry.
`;
function emit(value, json) {
  if (json) { console.log(JSON.stringify(value, null, 2)); return; }
  console.log(JSON.stringify(value, null, 2));
}
const args = process.argv.slice(2);
const op = args[0] || "--help";
const tail = args.slice(1);
const json = tail.includes("--json");
const validFlags = (allow) => tail.every(x => allow.includes(x));
function exitWithHelp() { console.error("AYE_PREVIEW_UNSUPPORTED_ARGUMENT\n" + guidance); process.exitCode=2; }
if (op === "--help" || op === "help" || op === "-h") {
  if (tail.length) exitWithHelp(); else console.log(guidance);
} else if (op === "version" || op === "--version") {
  if (tail.length) exitWithHelp(); else console.log(VERSION);
} else if (op === "doctor") {
  if (!validFlags(["--json"])) exitWithHelp();
  else {
    const result = {
      schema: "aye.preview.doctor/v1", preview: true, version: VERSION,
      status: "OBSERVED", readOnly: true,
      host: { platform: process.platform, arch: process.arch,
        osRelease: os.release(), hostname: os.hostname(), cpuCount: os.cpus().length,
        memoryTotalBytes: os.totalmem(), memoryFreeBytes: os.freemem(),
        nodeRuntime: process.versions.node },
      tools: Object.fromEntries(Object.entries(names).map(([k,v])=>[k,toolStatus(k,v)])),
      warnings: ["Local inspection only. No services installed or configured."]
    };
    emit(result,json);
  }
} else if (op === "status") {
  if (!validFlags(["--json"])) exitWithHelp();
  else emit({schema:"aye.preview.status/v1",preview:true,version:VERSION,
    local:"AVAILABLE",daemon:"NOT_CONNECTED",gitlab:"NOT_CONNECTED",
    mcp:"NOT_IMPLEMENTED",hostModification:false},json);
} else if (op === "setup") {
  if (!tail.includes("--plan") || !validFlags(["--plan","--json"])) exitWithHelp();
  else emit({schema:"aye.preview.setup-plan/v1",preview:true,status:"PLAN_ONLY",
    installAuthorized:false, changesApplied:false,
    actions:["Run aye doctor --json","Review missing tools and software provenance",
      "Install the full AYE Captain separately when a verified release is available"]},json);
} else exitWithHelp();
