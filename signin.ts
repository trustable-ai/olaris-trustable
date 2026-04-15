export {};
/*
  Implement signin.ts with bun without dependencies
  Accept an args as trustable <url>, then TRUSTABLE_URL, then derive it from OPS_APIHOST/APIHOST
  Connect to <url>/api/version and check it returns something like `{"build":"trustabledev_0.3.2-alpha_26.090.1013","expire":"2026/06/30","version":"Trustable v0.3.2-alpha"}`
  Retry up to 10 seconds until is available (1 second interval) otherwise give up with an error
  Execute `docker exec ollama ollama signin` and print the output.
  Parse the output, you find a url starting with https://ollama.com/connect extract the query string.
  Let the <signed-url> be the trustable url with the query string of ollama connect if found, otherwise it is just the trustable url.
  Invoke the browser with the <signed-url>.
  On Windows use powershell Start-Process to handle URLs with '&' in query strings.
  If opening a browser fails show the message:
  ````
  There is not a browser available, if you are connecting with ssh you need to:
  reconnect to the server with the command `sudo ssh -L 80:127.0.0.1:80 <user>@<server>`
  and then open the following url: <signed-url>
  ```
 */

const platform = process.platform;

function defaultTrustableUrl(): string {
  const rawApiHost = (Bun.env.OPS_APIHOST || Bun.env.APIHOST || Bun.env.TRUSTABLE_DEFAULT_APIHOST || "http://miniops.me").trim();
  const apiHost = /^https?:\/\//.test(rawApiHost) ? rawApiHost : `http://${rawApiHost}`;
  try {
    const parsed = new URL(apiHost);
    const baseHost = parsed.hostname;
    if (baseHost === "localhost" || baseHost === "127.0.0.1") {
      return parsed.origin;
    }
    const domain = (Bun.env.TRUSTABLE_DOMAIN || baseHost).trim();
    const host = (Bun.env.TRUSTABLE_HOST || `trustable.${domain}`).trim();
    return `${parsed.protocol}//${host}`;
  } catch {
    return "http://trustable.miniops.me";
  }
}

async function openUrl(url: string) {
  if (platform === "linux" && !Bun.env.DISPLAY && !Bun.env.WAYLAND_DISPLAY) {
    const user = Bun.env.USER || "<user>";
    console.log(
      `No graphical browser detected on this server.\n` +
        `Open this URL from your browser:\n${url}\n\n` +
        `If you need local port forwarding, reconnect with:\n` +
        `sudo ssh -L 80:127.0.0.1:80 ${user}@<server>`
    );
    return;
  }

  let cmd: string[];
  if (platform === "darwin") {
    cmd = ["open", url];
  } else if (platform === "win32") {
    cmd = ["powershell", "-Command", `Start-Process '${url}'`];
  } else {
    cmd = ["xdg-open", url];
  }
  try {
    const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" });
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`exit code ${exitCode}`);
  } catch {
    const user = Bun.env.USER || "<user>";
    console.log(
      `There is not a browser available, if you are connecting with ssh you need to:\n` +
        `reconnect to the server with the command \`sudo ssh -L 80:127.0.0.1:80 ${user}@<server>\`\n` +
        `and then open the following url: ${url}`
    );
  }
}

async function runOllama(args: string[]): Promise<string> {
  const proc = Bun.spawn(["docker", "exec", "ollama", "ollama", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const output = stdout + stderr;
  await proc.exited;
  return output;
}

function extractConnectQuery(output: string): string | null {
  const match = output.match(/https:\/\/ollama\.com\/connect\?([^\s]+)/);
  return match ? match[1] : null;
}

const trustableUrl = process.argv[2] || Bun.env.TRUSTABLE_URL || defaultTrustableUrl();

// Check version endpoint with retry (up to 10 seconds, 1s interval)
let versionData: { build: string; expire: string; version: string } | null = null;

for (let i = 0; i < 10; i++) {
  try {
    const res = await fetch(`${trustableUrl}/api/version`);
    if (res.ok) {
      versionData = await res.json();
      break;
    }
  } catch {
    // server not ready yet
  }
  await Bun.sleep(1000);
}

if (!versionData) {
  console.error(`Error: Trustable at ${trustableUrl} is not available after 10 seconds.`);
  process.exit(1);
}

// Execute ollama signin
let output = await runOllama(["signin"]);

console.log(output.trim());

// Extract the query string from the ollama connect URL
let queryString = extractConnectQuery(output);

if (!queryString && /already signed in/i.test(output)) {
  console.log("Ollama CLI is already signed in and did not return a browser connect URL.");
  console.log("Refreshing the Ollama sign-in session to generate a new Trustable browser link...");
  const signoutOutput = await runOllama(["signout"]);
  if (signoutOutput.trim()) console.log(signoutOutput.trim());
  output = await runOllama(["signin"]);
  console.log(output.trim());
  queryString = extractConnectQuery(output);
}

if (queryString) {
  const url = `${trustableUrl}?${queryString}`;
  console.log(`Trustable sign-in URL: ${url}`);
  console.log(`Direct Ollama Cloud URL: https://ollama.com/connect?${queryString}`);
  console.log(`Opening ${url}`);
  await openUrl(url);
} else {
  console.error("Error: Ollama did not return a connect URL, so Trustable browser sign-in cannot continue.");
  console.error("Please check the output of `docker exec ollama ollama signin`.");
  process.exit(1);
}

// Print version info
console.log(`Version: ${versionData!.version}`);
console.log(`Build: ${versionData!.build}`);
console.log(`Expiration: ${versionData!.expire}`);
