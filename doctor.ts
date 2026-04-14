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
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
  } catch (e: any) {
    return { stdout: "", stderr: e.message || String(e), exitCode: -1 };
  }
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

interface ClusterEndpoint {
  apiHost: string;
  proto: string;
  domain: string;
  trustableHost: string;
  opencodeHost: string;
  viteHost: string;
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

function normalizeApiHost(value: string): string {
  let apiHost = value.trim();
  if (!apiHost) return "http://miniops.me";
  if (!/^https?:\/\//.test(apiHost)) apiHost = `http://${apiHost}`;
  return apiHost.replace(/\/+$/, "");
}

async function clusterEndpoint(): Promise<ClusterEndpoint> {
  let apiHost = Bun.env.OPS_APIHOST || Bun.env.APIHOST || "";
  if (!apiHost) {
    const cfg = await exec(["kubectl", "-n", NAMESPACE, "get", "cm/config", "-o", "jsonpath={.metadata.annotations.apihost}"]);
    if (cfg.exitCode === 0) apiHost = cfg.stdout;
  }

  apiHost = normalizeApiHost(apiHost);
  let parsed: URL;
  try {
    parsed = new URL(apiHost);
  } catch {
    apiHost = "http://miniops.me";
    parsed = new URL(apiHost);
  }

  const domain = (Bun.env.TRUSTABLE_DOMAIN || parsed.hostname).trim();
  return {
    apiHost,
    proto: parsed.protocol.replace(":", ""),
    domain,
    trustableHost: (Bun.env.TRUSTABLE_HOST || `trustable.${domain}`).trim(),
    opencodeHost: (Bun.env.OPENCODE_HOST || `opencode.${domain}`).trim(),
    viteHost: (Bun.env.VITE_HOST || `vite.${domain}`).trim(),
  };
}

async function resolveHost(host: string): Promise<string[]> {
  if (process.platform === "win32") {
    const { stdout, exitCode } = await exec(["powershell", "-Command", `(Resolve-DnsName ${host} -Type A -ErrorAction SilentlyContinue).IPAddress`]);
    return exitCode === 0 ? stdout.split(/\s+/).filter(Boolean) : [];
  }
  const { stdout, exitCode } = await exec(["dig", "+short", host]);
  if (exitCode !== 0) return [];
  return stdout.split(/\s+/).filter((line) => /^\d{1,3}(\.\d{1,3}){3}$/.test(line));
}

function nipIoIp(host: string): string | undefined {
  const labels = host.split(".");
  const nipIndex = labels.findIndex((label, index) => label === "nip" && labels[index + 1] === "io");
  if (nipIndex < 4) return undefined;
  const parts = labels.slice(nipIndex - 4, nipIndex);
  if (parts.every((part) => /^\d{1,3}$/.test(part))) return parts.join(".");
  return undefined;
}

// --- Prereq Checks ---

async function checkPrereqs() {
  console.log(`\n${BOLD}# Prerequisites${RESET}\n`);

  // Docker in path
  const whichCmd = process.platform === "win32" ? "where" : "which";
  const dockerWhich = await exec([whichCmd, "docker"]);
  const dockerInPath = dockerWhich.exitCode === 0;
  if (dockerInPath) {
    record("Docker in PATH", "ok", dockerWhich.stdout);
  } else {
    record("Docker in PATH", "fail", "docker not found in PATH");
  }

  // Docker running
  if (dockerInPath) {
    try {
      const dockerInfo = await exec(["docker", "info"]);
      if (dockerInfo.exitCode === 0) {
        record("Docker running", "ok", "Docker daemon is responsive");
      } else {
        record("Docker running", "fail", "Docker daemon not responding", dockerInfo.stderr);
      }
    } catch (e: any) {
      record("Docker running", "fail", `Check error: ${e.message}`);
    }

    try {
      // Docker can pull and access internet
      const curlTest = await exec([
        "docker", "run", "--rm", "curlimages/curl", "-si", "http://google.com",
      ]);
      const hasHtml = /<html/i.test(curlTest.stdout);
      const hasLocation = /Location:/i.test(curlTest.stdout);
      if (curlTest.exitCode === 0 && hasHtml && hasLocation) {
        record("Docker internet", "ok", "Can pull images and access internet");
      } else {
        const detail = !hasHtml ? "No HTML in response" : !hasLocation ? "No Location redirect" : "curl failed";
        record("Docker internet", "fail", `Cannot pull images or access internet: ${detail}`, curlTest.stdout + curlTest.stderr);
      }
    } catch (e: any) {
      record("Docker internet", "fail", `Check error: ${e.message}`);
    }

    try {
      // Ollama container running
      const ollamaContainer = await exec(["docker", "ps", "--filter", "name=ollama", "--format", "{{.Names}}"]);
      if (ollamaContainer.stdout.includes("ollama")) {
        record("Ollama container", "ok", "Running");
      } else {
        record("Ollama container", "fail", "ollama container not running");
      }
    } catch (e: any) {
      record("Ollama container", "fail", `Check error: ${e.message}`);
    }

    try {
      // nuvolaris-control-plane container running
      const cpContainer = await exec(["docker", "ps", "--filter", "name=nuvolaris-control-plane", "--format", "{{.Names}}"]);
      if (cpContainer.stdout.includes("nuvolaris-control-plane")) {
        record("Control plane container", "ok", "Running");
      } else {
        record("Control plane container", "fail", "nuvolaris-control-plane container not running");
      }
    } catch (e: any) {
      record("Control plane container", "fail", `Check error: ${e.message}`);
    }
  } else {
    record("Docker running", "fail", "Skipped (docker not in PATH)");
    record("Docker internet", "fail", "Skipped (docker not in PATH)");
    record("Ollama container", "fail", "Skipped (docker not in PATH)");
    record("Control plane container", "fail", "Skipped (docker not in PATH)");
  }
}

// --- Port Checks ---

async function checkPorts() {
  console.log(`\n${BOLD}# Ports${RESET}\n`);
  const endpoint = await clusterEndpoint();
  record("Nuvolaris apihost", "ok", endpoint.apiHost);

  // DNS checks
  const hosts = [endpoint.domain, endpoint.trustableHost, endpoint.opencodeHost, endpoint.viteHost];
  const expectedIps = (Bun.env.TRUSTABLE_EXPECTED_IP || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (expectedIps.length === 0) {
    expectedIps.push(...await resolveHost(endpoint.domain));
  }
  if (expectedIps.length === 0) {
    const nipIp = nipIoIp(endpoint.domain) || nipIoIp(endpoint.trustableHost);
    if (nipIp) expectedIps.push(nipIp);
  }

  for (const host of hosts) {
    try {
      const resolved = await resolveHost(host);
      const overlap = expectedIps.length === 0 || resolved.some((ip) => expectedIps.includes(ip));
      if (resolved.length === 0) {
        record(`DNS ${host}`, "fail", "does not resolve");
      } else if (overlap) {
        const suffix = expectedIps.length > 0 ? `; expected ${expectedIps.join(", ")}` : "";
        record(`DNS ${host}`, "ok", `resolves to ${resolved.join(", ")}${suffix}`);
      } else {
        record(`DNS ${host}`, "fail", `resolves to ${resolved.join(", ")}; expected ${expectedIps.join(", ")}`);
      }
    } catch (e: any) {
      record(`DNS ${host}`, "fail", `DNS check error: ${e.message}`);
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
    const resp = await fetch(`${endpoint.apiHost}/api/info`, { signal: AbortSignal.timeout(5000) });
    const json = await resp.json();
    if (json.description === "OpenWhisk") {
      record("OpenWhisk API", "ok", `OpenWhisk responding at ${endpoint.apiHost}`);
    } else {
      record("OpenWhisk API", "fail", `description is '${json.description}' (expected OpenWhisk)`);
    }
  } catch (e: any) {
    record("OpenWhisk API", "fail", `Cannot connect: ${e.message}`);
  }

  // SSH check on port 2222
  try {
    let bannerRecorded = false;
    const socket = await Bun.connect({
      hostname: "localhost",
      port: 2222,
      socket: {
        data(_socket: any, data: any) {
          if (bannerRecorded) return;
          bannerRecorded = true;
          const text = new TextDecoder().decode(data);
          if (text.startsWith("SSH")) {
            record("SSH port 2222", "ok", text.split("\n")[0]);
          } else {
            record("SSH port 2222", "fail", `Unexpected banner: ${text.slice(0, 50)}`);
          }
        },
        open(_socket: any) {},
        close(_socket: any) {},
        error(_socket: any, _error: any) {},
      },
    });
    // Wait for banner or timeout
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (bannerRecorded) { clearInterval(check); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 3000);
    });
    if (!bannerRecorded) {
      record("SSH port 2222", "fail", "No SSH banner received within 3s");
    }
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
  }

  // Namespace check
  const ns = await exec(["kubectl", "get", "namespace", NAMESPACE]);
  if (ns.exitCode === 0) {
    record("Namespace", "ok", `${NAMESPACE} exists`);
  } else {
    record("Namespace", "fail", `${NAMESPACE} namespace not found`);
  }

  // Get all pods
  const podsJson = await exec([
    "kubectl", "get", "pods", "-n", NAMESPACE, "-o", "json",
  ]);
  let podList: any[] = [];
  if (podsJson.exitCode !== 0) {
    record("Pods", "fail", "Cannot list pods", podsJson.stderr);
  } else {
    try {
      const pods = JSON.parse(podsJson.stdout);
      podList = pods.items || [];
    } catch (e: any) {
      record("Pods", "fail", `Cannot parse pod list: ${e.message}`);
    }
  }
  const podNames = podList.map((p: any) => p.metadata.name);

  // Check all pods are Running or Completed
  if (podList.length > 0) {
    const badPods = podList.filter((p: any) => {
      const phase = p.status.phase;
      return phase !== "Running" && phase !== "Succeeded";
    });
    if (badPods.length === 0) {
      record("All pods status", "ok", "All pods are Running or Completed");
    } else {
      const summary = badPods.map((p: any) => `${p.metadata.name} (${p.status.phase})`).join(", ");
      record("All pods status", "fail", `Pods not Running/Completed: ${summary}`);
    }
  }

  // Check expected running pods
  console.log(`\n${BOLD}  Expected Running Pods${RESET}\n`);
  for (const pattern of EXPECTED_RUNNING) {
    const found = podNames.find((n: string) => matchesPattern(n, pattern));
    if (found) {
      const pod = podList.find((p: any) => p.metadata.name === found);
      const phase = pod.status.phase;
      const containerStatuses = [
        ...(pod.status.containerStatuses || []),
        ...(pod.status.initContainerStatuses || []),
      ];
      // Check for container-level problems even when phase is "Running"
      const crashingContainer = containerStatuses.find(
        (cs: any) => cs.state?.waiting?.reason === "CrashLoopBackOff"
      );
      const errorWaiting = containerStatuses.find(
        (cs: any) => cs.state?.waiting && cs.state.waiting.reason !== "ContainerCreating"
      );
      const highRestarts = containerStatuses.find(
        (cs: any) => cs.restartCount > 3
      );

      if (phase === "Running" && !crashingContainer && !errorWaiting && !highRestarts) {
        record(`Pod ${pattern}`, "ok", `${found} is Running`);
      } else if (crashingContainer) {
        record(`Pod ${pattern}`, "fail", `${found} is CrashLoopBackOff (phase: ${phase})`);
      } else if (errorWaiting) {
        record(`Pod ${pattern}`, "fail", `${found} has container waiting: ${errorWaiting.state.waiting.reason}`);
      } else if (highRestarts) {
        record(`Pod ${pattern}`, "warn", `${found} is ${phase} but has ${highRestarts.restartCount} restarts`);
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
    try {
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
      }

      if (anomalies.length === 0) continue;
      anomalyCount++;

      const anomalyStr = anomalies.join(", ");
      record(`Anomaly ${name}`, anomalies.some(a => ["CrashLoopBackOff", "Failed", "OOMKilled", "Error", "Evicted"].includes(a)) ? "fail" : "warn", anomalyStr);

      // Gather details per anomaly type
      for (const anomaly of anomalies) {
        try {
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

          if (anomaly === "Terminating") {
            const since = pod.metadata.deletionTimestamp;
            const finalizers = pod.metadata.finalizers || [];
            const msg = `Since: ${since}, Finalizers: ${finalizers.join(", ") || "none"}`;
            anomalyLogs.push({ description: `Terminating details for ${name}`, log: msg });
            record(`  Terminating`, "warn", msg);
          }
        } catch (e: any) {
          record(`  ${anomaly} details`, "warn", `Could not gather details: ${e.message}`);
        }
      }
    } catch (e: any) {
      record(`Anomaly check`, "warn", `Error inspecting pod: ${e.message}`);
    }
  }

  if (anomalyCount === 0) {
    record("Anomalies", "ok", "No anomalies detected");
  }

  // Restart count informational note (not an anomaly)
  const restartedPods: { name: string; restarts: number }[] = [];
  for (const pod of podList) {
    const allStatuses = [
      ...(pod.status?.containerStatuses || []),
      ...(pod.status?.initContainerStatuses || []),
    ];
    for (const cs of allStatuses) {
      if (cs.restartCount > 0) {
        restartedPods.push({ name: pod.metadata.name, restarts: cs.restartCount });
        break;
      }
    }
  }
  if (restartedPods.length > 0) {
    const totalRestarts = restartedPods.reduce((sum, p) => sum + p.restarts, 0);
    const listing = restartedPods.map(p => `${p.name}: ${p.restarts}`).join(", ");
    record("Restart note", "warn", `Found ${totalRestarts} restarts: ${listing}`);
  }
}

// --- Reporting ---

async function safeExec(cmd: string[], fallback = "N/A"): Promise<string> {
  const result = await exec(cmd);
  return result.exitCode === 0 ? result.stdout : fallback;
}

async function gatherSystemInfo(): Promise<string> {
  const hostname = await safeExec(["hostname"]);
  const uname = process.platform === "win32"
    ? await safeExec(["powershell", "-Command", "[System.Environment]::OSVersion.VersionString"])
    : await safeExec(["uname", "-a"]);
  const dockerVersion = await safeExec(["docker", "version", "--format", "{{.Server.Version}}"]);
  const kubeVersion = await safeExec(["kubectl", "version", "--short"]);
  const opsInfo = await safeExec(["ops", "-info"]);

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
    `- **Hostname**: ${hostname}`,
    `- **OS**: ${uname}`,
    `- **Docker version**: ${dockerVersion}`,
    `- **Kubernetes version**: ${kubeVersion.replace(/\n/g, ", ")}`,
    ``,
    `## ops -info`,
    "```",
    opsInfo,
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

  const hostname = await safeExec(["hostname"]);
  const uname = process.platform === "win32"
    ? await safeExec(["powershell", "-Command", "[System.Environment]::OSVersion.VersionString"])
    : await safeExec(["uname", "-a"]);

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

  const MAX_COMMENT_SIZE = 65000;

  for (const { description, log } of logComments) {
    if (!log.trim()) continue;

    // Split log into chunks at line boundaries
    const chunks: string[] = [];
    const lines = log.split("\n");
    let current = "";
    for (const line of lines) {
      // Reserve space for header + code fences (~200 chars)
      if (current.length + line.length + 1 > MAX_COMMENT_SIZE - 200 && current.length > 0) {
        chunks.push(current);
        current = line;
      } else {
        current += (current ? "\n" : "") + line;
      }
    }
    if (current) chunks.push(current);

    const totalParts = chunks.length;
    for (let i = 0; i < chunks.length; i++) {
      const partLabel = totalParts > 1 ? ` (Part ${i + 1}/${totalParts})` : "";
      const commentBody = `# ${description}${partLabel}\n\`\`\`\n${chunks[i]}\n\`\`\``;
      const commentResp = await fetch(ISSUE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: issueNumber, body: commentBody }),
      });
      if (commentResp.ok) {
        console.log(`  ${GREEN}✓${RESET} Comment added: ${description}${partLabel}`);
      } else {
        console.log(`  ${RED}✗${RESET} Failed to add comment: ${description}${partLabel}`);
      }
    }
  }

  console.log(`\n${GREEN}Report filed successfully: ${issueUrl}${RESET}`);
}

// --- Main ---

async function saveReport() {
  const fails = results.filter(r => r.severity === "fail").length;
  const warns = results.filter(r => r.severity === "warn").length;
  const oks = results.filter(r => r.severity === "ok").length;

  const reportLines: string[] = [
    "Trustable Doctor Report",
    "─".repeat(40),
    "",
  ];

  // System info (same as GitHub issue body)
  try {
    const systemInfo = await gatherSystemInfo();
    reportLines.push(systemInfo);
  } catch (e: any) {
    reportLines.push(`(Could not gather system info: ${e.message})`);
  }
  reportLines.push("");
  reportLines.push(`Summary: ${oks} passed, ${warns} warnings, ${fails} failures`);

  // Key pod logs (same as GitHub comments)
  reportLines.push("");
  reportLines.push("Pod Logs");
  reportLines.push("─".repeat(40));
  for (const podName of ["trustable-0", "nuvolaris-operator-0", "controller-0"]) {
    try {
      const logs = await exec(["kubectl", "logs", podName, "-n", NAMESPACE, "--tail=200"]);
      if (logs.stdout) {
        reportLines.push("");
        reportLines.push(`# Logs of ${podName}`);
        reportLines.push("```");
        reportLines.push(logs.stdout);
        reportLines.push("```");
      }
    } catch (e: any) {
      reportLines.push("");
      reportLines.push(`# Logs of ${podName}`);
      reportLines.push(`(Could not retrieve logs: ${e.message})`);
    }
  }

  // Anomaly logs
  if (anomalyLogs.length > 0) {
    reportLines.push("");
    reportLines.push("Anomaly Details");
    reportLines.push("─".repeat(40));
    for (const { description, log } of anomalyLogs) {
      reportLines.push("");
      reportLines.push(`# ${description}`);
      reportLines.push("```");
      reportLines.push(log);
      reportLines.push("```");
    }
  }

  const { resolve } = await import("path");
  const reportDir = process.env.OPS_PWD || ".";
  const reportPath = resolve(reportDir, "trustable-doctor.txt");
  await Bun.write(reportPath, reportLines.join("\n") + "\n");
  console.log(`${GREEN}trustable doctor report saved in ${reportPath}${RESET}\n`);
}

async function main() {
  console.log(`${BOLD}${CYAN}Trustable Doctor${RESET}`);
  console.log(`${"─".repeat(40)}`);

  try { await checkPrereqs(); } catch (e: any) {
    record("Prerequisites", "fail", `Section crashed: ${e.message}`);
  }

  try { await checkPorts(); } catch (e: any) {
    record("Ports", "fail", `Section crashed: ${e.message}`);
  }

  try { await checkKubernetes(); } catch (e: any) {
    record("Kubernetes", "fail", `Section crashed: ${e.message}`);
  }

  // Summary
  console.log(`\n${BOLD}# Summary${RESET}\n`);
  const fails = results.filter(r => r.severity === "fail").length;
  const warns = results.filter(r => r.severity === "warn").length;
  const oks = results.filter(r => r.severity === "ok").length;

  console.log(`  ${GREEN}✓ ${oks} passed${RESET}  ${YELLOW}⚠ ${warns} warnings${RESET}  ${RED}✗ ${fails} failures${RESET}\n`);

  // Always save the report, even if something went wrong
  try {
    await saveReport();
  } catch (e: any) {
    console.error(`${RED}Failed to save report file: ${e.message}${RESET}`);
  }

  // Ask to report
  try {
    const resultLabel = fails > 0 ? "Failure" : "Success";
    const answer = await prompt(`Would you like to file a report on GitHub to report Success/Failure? (y/n)`);
    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
      await fileReport(resultLabel);
    } else {
      console.log("Skipping report.");
    }
  } catch (e: any) {
    console.error(`${RED}Failed to file report: ${e.message}${RESET}`);
  }

  // Support community
  try {
    const resp = await fetch("https://qrenco.de/n7s.co/wa-trustable", {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "curl/8.0" },
    });
    if (resp.ok) {
      const qr = await resp.text();
      console.log(qr);
    }
  } catch {}
  console.log(`\n${BOLD}Join our support community on WhatsApp at https://n7s.co/wa-trustable${RESET}\n`);
}

main().catch((e) => {
  console.error(`${RED}Doctor failed: ${e.message}${RESET}`);
  process.exit(1);
});
