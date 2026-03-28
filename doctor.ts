/*
  doctor.ts — Trustable diagnostic tool
  Run with: bun doctor.ts
  No dependencies. Uses docker, kubectl, coreutils on PATH.
*/

const ISSUE_API = "https://nuvolaris.org/api/v1/web/landing/v1/issue";
const NAMESPACE = "nuvolaris";

const EXPECTED_RUNNING = [
  "controller-0",
  "couchdb-0",
  "nuvolaris-etcd-0",
  "nuvolaris-mongodb-0",
  "nuvolaris-operator-0",
  "nuvolaris-postgres-1-0",
  "nuvolaris-static-0",
  "nuvolaris-streamer-api-0",
  "nuvolaris-system-api-0",
  "redis-0",
  "registry-0",
  "seaweedfs-0",
  "trustable-0",
  "kubegres-controller-manager-*",
  "nuvolaris-milvus-standalone-*",
];

const EXPECTED_COMPLETED = [
  "couchdb-init-*",
  "cron-init-*",
  "preload-runtimes-*",
];

// --- Utilities ---

async function exec(cmd: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

function matchesPattern(name: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    return name.startsWith(pattern.slice(0, -1));
  }
  return name === pattern;
}

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

type Severity = "ok" | "warn" | "fail";

interface CheckResult {
  name: string;
  severity: Severity;
  message: string;
  details?: string;
}

const results: CheckResult[] = [];
const anomalyLogs: { description: string; log: string }[] = [];

function record(name: string, severity: Severity, message: string, details?: string) {
  results.push({ name, severity, message, details });
  const icon = severity === "ok" ? `${GREEN}✓${RESET}` : severity === "warn" ? `${YELLOW}⚠${RESET}` : `${RED}✗${RESET}`;
  console.log(`  ${icon} ${name}: ${message}`);
  if (details && severity !== "ok") {
    for (const line of details.split("\n").slice(0, 5)) {
      console.log(`      ${line}`);
    }
  }
}

async function prompt(question: string): Promise<string> {
  process.stdout.write(`${CYAN}${question}${RESET} `);
  for await (const line of console) {
    return line.trim();
  }
  return "";
}

// --- Prereq Checks ---

async function checkPrereqs() {
  console.log(`\n${BOLD}# Prerequisites${RESET}\n`);

  // Memory check
  try {
    const { stdout } = await exec(["sysctl", "-n", "hw.memsize"]);
    const gb = parseInt(stdout) / (1024 ** 3);
    if (gb >= 16) {
      record("Memory", "ok", `${gb.toFixed(0)} GB`);
    } else {
      record("Memory", "fail", `${gb.toFixed(0)} GB (need at least 16 GB)`);
    }
  } catch {
    // Linux fallback
    try {
      const { stdout } = await exec(["sh", "-c", "grep MemTotal /proc/meminfo | awk '{print $2}'"]);
      const gb = parseInt(stdout) / (1024 * 1024);
      if (gb >= 16) {
        record("Memory", "ok", `${gb.toFixed(0)} GB`);
      } else {
        record("Memory", "fail", `${gb.toFixed(0)} GB (need at least 16 GB)`);
      }
    } catch {
      record("Memory", "warn", "Could not determine memory");
    }
  }

  // Disk check
  try {
    const { stdout } = await exec(["df", "-g", "."]);
    const lines = stdout.split("\n");
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      const available = parseInt(parts[3]);
      if (available >= 30) {
        record("Disk", "ok", `${available} GB available`);
      } else {
        record("Disk", "fail", `${available} GB available (need at least 30 GB)`);
      }
    }
  } catch {
    record("Disk", "warn", "Could not determine disk space");
  }

  // Docker in path
  const dockerWhich = await exec(["which", "docker"]);
  if (dockerWhich.exitCode === 0) {
    record("Docker in PATH", "ok", dockerWhich.stdout);
  } else {
    record("Docker in PATH", "fail", "docker not found in PATH");
    return; // Can't continue without docker
  }

  // Docker running
  const dockerInfo = await exec(["docker", "info"]);
  if (dockerInfo.exitCode === 0) {
    record("Docker running", "ok", "Docker daemon is responsive");
  } else {
    record("Docker running", "fail", "Docker daemon not responding", dockerInfo.stderr);
    return;
  }

  // Docker can pull and access internet
  const curlTest = await exec([
    "docker", "run", "--rm", "curlimages/curl", "-sI", "http://google.com",
  ]);
  if (curlTest.exitCode === 0 && curlTest.stdout.includes("Location")) {
    record("Docker internet", "ok", "Can pull images and access internet");
  } else {
    record("Docker internet", "fail", "Cannot pull images or access internet", curlTest.stdout + curlTest.stderr);
  }

  // Ollama container running
  const ollamaContainer = await exec(["docker", "ps", "--filter", "name=ollama", "--format", "{{.Names}}"]);
  if (ollamaContainer.stdout.includes("ollama")) {
    record("Ollama container", "ok", "Running");
  } else {
    record("Ollama container", "fail", "ollama container not running");
  }

  // nuvolaris-control-plane container running
  const cpContainer = await exec(["docker", "ps", "--filter", "name=nuvolaris-control-plane", "--format", "{{.Names}}"]);
  if (cpContainer.stdout.includes("nuvolaris-control-plane")) {
    record("Control plane container", "ok", "Running");
  } else {
    record("Control plane container", "fail", "nuvolaris-control-plane container not running");
  }
}

// --- Port Checks ---

async function checkPorts() {
  console.log(`\n${BOLD}# Ports${RESET}\n`);

  // DNS checks
  const hosts = ["miniops.me", "trustable.miniops.me", "opencode.miniops.me", "vite.miniops.me"];
  for (const host of hosts) {
    const { stdout, exitCode } = await exec(["sh", "-c", `dig +short ${host} | head -1`]);
    if (exitCode === 0 && stdout.trim() === "127.0.0.1") {
      record(`DNS ${host}`, "ok", "resolves to 127.0.0.1");
    } else {
      record(`DNS ${host}`, "fail", `resolves to '${stdout}' (expected 127.0.0.1)`);
    }
  }

  // Ollama HTTP
  try {
    const resp = await fetch("http://localhost:11434", { signal: AbortSignal.timeout(5000) });
    const text = await resp.text();
    if (text.includes("Ollama is running")) {
      record("Ollama HTTP", "ok", "Ollama is running");
    } else {
      record("Ollama HTTP", "fail", `Unexpected response: ${text.slice(0, 100)}`);
    }
  } catch (e: any) {
    record("Ollama HTTP", "fail", `Cannot connect: ${e.message}`);
  }

  // OpenWhisk API
  try {
    const resp = await fetch("http://miniops.me/api/info", { signal: AbortSignal.timeout(5000) });
    const json = await resp.json();
    if (json.description === "OpenWhisk") {
      record("OpenWhisk API", "ok", "OpenWhisk responding");
    } else {
      record("OpenWhisk API", "fail", `description is '${json.description}' (expected OpenWhisk)`);
    }
  } catch (e: any) {
    record("OpenWhisk API", "fail", `Cannot connect: ${e.message}`);
  }

  // SSH check on port 2222
  try {
    const socket = await Bun.connect({
      hostname: "localhost",
      port: 2222,
      socket: {
        data(socket, data) {},
        open(socket) {},
        close(socket) {},
        error(socket, error) {},
      },
    });
    // Read initial banner
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 3000);
      socket.data = (s: any, data: Buffer) => {
        const text = new TextDecoder().decode(data);
        if (text.startsWith("SSH")) {
          record("SSH port 2222", "ok", text.split("\n")[0]);
        } else {
          record("SSH port 2222", "fail", `Unexpected banner: ${text.slice(0, 50)}`);
        }
        clearTimeout(timeout);
        resolve();
      };
    });
    socket.end();
  } catch (e: any) {
    record("SSH port 2222", "fail", `Cannot connect: ${e.message}`);
  }
}

// --- Kubernetes Checks ---

async function checkKubernetes() {
  console.log(`\n${BOLD}# Kubernetes${RESET}\n`);

  // Node check
  const nodes = await exec(["kubectl", "get", "nodes", "-o", "jsonpath={.items[*].metadata.name}"]);
  if (nodes.stdout.includes("nuvolaris-control-plane")) {
    record("Node", "ok", "nuvolaris-control-plane found");
  } else {
    record("Node", "fail", `nuvolaris-control-plane not found. Nodes: ${nodes.stdout}`);
    return;
  }

  // Namespace check
  const ns = await exec(["kubectl", "get", "namespace", NAMESPACE]);
  if (ns.exitCode === 0) {
    record("Namespace", "ok", `${NAMESPACE} exists`);
  } else {
    record("Namespace", "fail", `${NAMESPACE} namespace not found`);
    return;
  }

  // Get all pods
  const podsJson = await exec([
    "kubectl", "get", "pods", "-n", NAMESPACE, "-o", "json",
  ]);
  if (podsJson.exitCode !== 0) {
    record("Pods", "fail", "Cannot list pods", podsJson.stderr);
    return;
  }

  const pods = JSON.parse(podsJson.stdout);
  const podList: any[] = pods.items;
  const podNames = podList.map((p: any) => p.metadata.name);

  // Check expected running pods
  console.log(`\n${BOLD}  Expected Running Pods${RESET}\n`);
  for (const pattern of EXPECTED_RUNNING) {
    const found = podNames.find((n: string) => matchesPattern(n, pattern));
    if (found) {
      const pod = podList.find((p: any) => p.metadata.name === found);
      const phase = pod.status.phase;
      if (phase === "Running") {
        record(`Pod ${pattern}`, "ok", `${found} is Running`);
      } else {
        record(`Pod ${pattern}`, "fail", `${found} is ${phase} (expected Running)`);
      }
    } else {
      record(`Pod ${pattern}`, "fail", "Not found");
    }
  }

  // Check expected completed jobs
  console.log(`\n${BOLD}  Expected Completed Jobs${RESET}\n`);
  for (const pattern of EXPECTED_COMPLETED) {
    const found = podNames.find((n: string) => matchesPattern(n, pattern));
    if (found) {
      const pod = podList.find((p: any) => p.metadata.name === found);
      const phase = pod.status.phase;
      if (phase === "Succeeded") {
        record(`Job ${pattern}`, "ok", `${found} Completed`);
      } else {
        record(`Job ${pattern}`, "warn", `${found} is ${phase} (expected Succeeded)`);
      }
    } else {
      record(`Job ${pattern}`, "warn", "Not found");
    }
  }

  // Anomaly detection
  console.log(`\n${BOLD}  Anomaly Detection${RESET}\n`);
  let anomalyCount = 0;

  for (const pod of podList) {
    const name = pod.metadata.name;
    const phase = pod.status.phase;
    const conditions = pod.status.conditions || [];
    const containerStatuses = [
      ...(pod.status.containerStatuses || []),
      ...(pod.status.initContainerStatuses || []),
    ];

    const anomalies: string[] = [];

    // Phase anomalies
    if (phase === "Pending") anomalies.push("Pending");
    if (phase === "Failed") anomalies.push("Failed");
    if (phase === "Unknown") anomalies.push("Unknown");

    // Evicted
    if (pod.status.reason === "Evicted") anomalies.push("Evicted");

    // Terminating (has deletionTimestamp)
    if (pod.metadata.deletionTimestamp) anomalies.push("Terminating");

    // Not Ready (running but not ready)
    if (phase === "Running") {
      const readyCond = conditions.find((c: any) => c.type === "Ready");
      if (readyCond && readyCond.status === "False") anomalies.push("Not Ready");
    }

    // Container-level anomalies
    for (const cs of containerStatuses) {
      const waiting = cs.state?.waiting;
      const terminated = cs.state?.terminated;

      if (waiting?.reason === "CrashLoopBackOff") anomalies.push("CrashLoopBackOff");
      if (waiting?.reason === "ImagePullBackOff") anomalies.push("ImagePullBackOff");
      if (waiting?.reason === "ErrImagePull") anomalies.push("ErrImagePull");
      if (waiting?.reason === "CreateContainerConfigError") anomalies.push("CreateContainerConfigError");
      if (terminated?.reason === "OOMKilled") anomalies.push("OOMKilled");
      if (terminated?.reason === "Error") anomalies.push("Error");

      // Restart count
      if (cs.restartCount > 0 && phase === "Running") {
        anomalies.push(`Restarts(${cs.restartCount})`);
      }
    }

    if (anomalies.length === 0) continue;
    anomalyCount++;

    const anomalyStr = anomalies.join(", ");
    record(`Anomaly ${name}`, anomalies.some(a => ["CrashLoopBackOff", "Failed", "OOMKilled", "Error", "Evicted"].includes(a)) ? "fail" : "warn", anomalyStr);

    // Gather details per anomaly type
    for (const anomaly of anomalies) {
      if (anomaly === "ImagePullBackOff" || anomaly === "ErrImagePull") {
        const cs = containerStatuses.find((c: any) => c.state?.waiting?.reason === anomaly);
        const image = cs?.image || "unknown";
        record(`  Image pull`, "fail", `Cannot pull: ${image}`);
        const pull = await exec(["docker", "pull", image]);
        if (pull.exitCode === 0) {
          record(`  Docker pull`, "ok", `Pulled ${image} successfully`);
        } else {
          record(`  Docker pull`, "fail", `Failed to pull ${image}`, pull.stderr);
        }
        anomalyLogs.push({ description: `ImagePull details for ${name}`, log: `Image: ${image}\n${pull.stdout}\n${pull.stderr}` });
      }

      if (anomaly === "CrashLoopBackOff") {
        const logs = await exec(["kubectl", "logs", name, "-n", NAMESPACE, "--previous", "--tail=100"]);
        anomalyLogs.push({ description: `CrashLoopBackOff logs for ${name}`, log: logs.stdout || logs.stderr });
        record(`  Previous logs`, "fail", `Extracted for ${name}`, (logs.stdout || logs.stderr).split("\n").slice(-3).join("\n"));
      }

      if (anomaly === "CreateContainerConfigError") {
        const describe = await exec(["kubectl", "describe", "pod", name, "-n", NAMESPACE]);
        anomalyLogs.push({ description: `CreateContainerConfigError for ${name}`, log: describe.stdout });
        record(`  Config error`, "fail", `Described ${name}`, describe.stdout.split("\n").slice(-5).join("\n"));
      }

      if (anomaly === "OOMKilled") {
        const describe = await exec(["kubectl", "describe", "pod", name, "-n", NAMESPACE]);
        const resourceLines = describe.stdout.split("\n").filter((l: string) => l.match(/memory|limits|requests|OOMKilled/i));
        anomalyLogs.push({ description: `OOMKilled details for ${name}`, log: resourceLines.join("\n") });
        record(`  OOMKilled`, "fail", `Memory limits for ${name}`, resourceLines.slice(0, 3).join("\n"));
      }

      if (anomaly === "Pending") {
        const describe = await exec(["kubectl", "describe", "pod", name, "-n", NAMESPACE]);
        const events = describe.stdout.split("Events:")[1] || "";
        anomalyLogs.push({ description: `Pending details for ${name}`, log: events });
        record(`  Scheduling`, "warn", `Pending details for ${name}`, events.split("\n").slice(0, 5).join("\n"));
      }

      if (anomaly === "Failed" || anomaly === "Error") {
        const logs = await exec(["kubectl", "logs", name, "-n", NAMESPACE, "--tail=100"]);
        anomalyLogs.push({ description: `${anomaly} logs for ${name}`, log: logs.stdout || logs.stderr });
        record(`  ${anomaly} logs`, "fail", `Extracted for ${name}`, (logs.stdout || logs.stderr).split("\n").slice(-3).join("\n"));
      }

      if (anomaly === "Evicted") {
        const reason = pod.status.message || pod.status.reason || "Unknown";
        anomalyLogs.push({ description: `Evicted details for ${name}`, log: reason });
        record(`  Evicted`, "fail", reason);
      }

      if (anomaly === "Not Ready") {
        const describe = await exec(["kubectl", "describe", "pod", name, "-n", NAMESPACE]);
        const readinessLines = describe.stdout.split("\n").filter((l: string) => l.match(/readiness|ready|probe/i));
        const events = describe.stdout.split("Events:")[1] || "";
        anomalyLogs.push({ description: `Not Ready details for ${name}`, log: readinessLines.join("\n") + "\n" + events });
        record(`  Not Ready`, "warn", `Readiness probe details for ${name}`, readinessLines.slice(0, 3).join("\n"));
      }

      if (anomaly.startsWith("Restarts(")) {
        const cs = containerStatuses.find((c: any) => c.restartCount > 0);
        const lastTermination = cs?.lastState?.terminated;
        const reason = lastTermination?.reason || "Unknown";
        const exitCode = lastTermination?.exitCode ?? "?";
        record(`  Restarts`, "warn", `${name}: ${anomaly}, last exit: ${reason} (code ${exitCode})`);
        anomalyLogs.push({ description: `Restart details for ${name}`, log: `Restart count: ${cs?.restartCount}, Last termination: ${reason}, Exit code: ${exitCode}` });
      }

      if (anomaly === "Terminating") {
        const since = pod.metadata.deletionTimestamp;
        const finalizers = pod.metadata.finalizers || [];
        const msg = `Since: ${since}, Finalizers: ${finalizers.join(", ") || "none"}`;
        anomalyLogs.push({ description: `Terminating details for ${name}`, log: msg });
        record(`  Terminating`, "warn", msg);
      }
    }
  }

  if (anomalyCount === 0) {
    record("Anomalies", "ok", "No anomalies detected");
  }
}

// --- Reporting ---

async function gatherSystemInfo(): Promise<string> {
  const hostname = await exec(["coreutils", "hostname"]);
  const uname = await exec(["coreutils", "uname", "-a"]);
  const dockerVersion = await exec(["docker", "version", "--format", "{{.Server.Version}}"]);
  const kubeVersion = await exec(["kubectl", "version", "--short"]);
  const opsInfo = await exec(["ops", "-info"]);

  let opsroot = "";
  try {
    const home = process.env.HOME || "~";
    const file = Bun.file(`${home}/.ops/olaris-trustable/opsroot.json`);
    opsroot = await file.text();
  } catch {
    opsroot = "Could not read opsroot.json";
  }

  const lines = [
    `## System Info`,
    `- **Hostname**: ${hostname.stdout}`,
    `- **OS**: ${uname.stdout}`,
    `- **Docker version**: ${dockerVersion.stdout}`,
    `- **Kubernetes version**: ${kubeVersion.stdout.replace(/\n/g, ", ")}`,
    ``,
    `## ops -info`,
    "```",
    opsInfo.stdout,
    "```",
    ``,
    `## Trustable Images (opsroot.json)`,
    "```json",
    opsroot,
    "```",
    ``,
    `## Check Results`,
    ``,
  ];

  for (const r of results) {
    const icon = r.severity === "ok" ? "✅" : r.severity === "warn" ? "⚠️" : "❌";
    lines.push(`${icon} **${r.name}**: ${r.message}`);
    if (r.details && r.severity !== "ok") {
      lines.push("```");
      lines.push(r.details.slice(0, 2000));
      lines.push("```");
    }
  }

  return lines.join("\n");
}

async function fileReport(resultLabel: string) {

  const hostname = (await exec(["coreutils", "hostname"])).stdout;
  const uname = (await exec(["coreutils", "uname", "-a"])).stdout;

  const title = `${resultLabel} for ${hostname} running ${uname}`;
  const body = await gatherSystemInfo();

  console.log(`\n${CYAN}Filing issue: ${title}${RESET}\n`);

  // Create issue
  const issueResp = await fetch(ISSUE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ open: title, body }),
  });

  if (!issueResp.ok) {
    console.log(`${RED}Failed to create issue: ${issueResp.status} ${await issueResp.text()}${RESET}`);
    return;
  }

  const issueData = await issueResp.json();
  const issueNumber = issueData.number;
  const issueUrl = issueData.url;
  console.log(`${GREEN}Issue created: #${issueNumber} — ${issueUrl}${RESET}\n`);

  // Post log comments
  const logComments: { description: string; log: string }[] = [];

  // Always include key pod logs
  for (const podName of ["trustable-0", "nuvolaris-operator-0", "controller-0"]) {
    const logs = await exec(["kubectl", "logs", podName, "-n", NAMESPACE, "--tail=200"]);
    if (logs.stdout) {
      logComments.push({ description: `Logs of ${podName}`, log: logs.stdout });
    }
  }

  // Add anomaly logs
  logComments.push(...anomalyLogs);

  for (const { description, log } of logComments) {
    if (!log.trim()) continue;
    const commentBody = `# ${description}\n\`\`\`\n${log.slice(0, 60000)}\n\`\`\``;
    const commentResp = await fetch(ISSUE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: issueNumber, body: commentBody }),
    });
    if (commentResp.ok) {
      console.log(`  ${GREEN}✓${RESET} Comment added: ${description}`);
    } else {
      console.log(`  ${RED}✗${RESET} Failed to add comment: ${description}`);
    }
  }

  console.log(`\n${GREEN}Report filed successfully: ${issueUrl}${RESET}`);
}

// --- Main ---

async function main() {
  console.log(`${BOLD}${CYAN}Trustable Doctor${RESET}`);
  console.log(`${"─".repeat(40)}`);

  await checkPrereqs();
  await checkPorts();
  await checkKubernetes();

  // Summary
  console.log(`\n${BOLD}# Summary${RESET}\n`);
  const fails = results.filter(r => r.severity === "fail").length;
  const warns = results.filter(r => r.severity === "warn").length;
  const oks = results.filter(r => r.severity === "ok").length;

  console.log(`  ${GREEN}✓ ${oks} passed${RESET}  ${YELLOW}⚠ ${warns} warnings${RESET}  ${RED}✗ ${fails} failures${RESET}\n`);

  // Ask to report
  const resultLabel = fails > 0 ? "Failure" : "Success";
  const answer = await prompt(`Would you like to file a report on GitHub to report ${resultLabel}? (y/n)`);
  if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
    await fileReport(resultLabel);
  } else {
    console.log("Skipping report.");
  }
}

main().catch((e) => {
  console.error(`${RED}Doctor failed: ${e.message}${RESET}`);
  process.exit(1);
});
