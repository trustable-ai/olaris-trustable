export {};
/*
  Implement signin.ts with bun without dependencies
  Accept an args as trustable <url>, then TRUSTABLE_URL, then http://trustable.miniops.me
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

const trustableUrl = process.argv[2] || Bun.env.TRUSTABLE_URL || "http://trustable.miniops.me";

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
const proc = Bun.spawn(["docker", "exec", "ollama", "ollama", "signin"], {
  stdout: "pipe",
  stderr: "pipe",
});

const stdout = await new Response(proc.stdout).text();
const stderr = await new Response(proc.stderr).text();
const output = stdout + stderr;

console.log(output.trim());

// Extract the query string from the ollama connect URL
const match = output.match(/https:\/\/ollama\.com\/connect\?([^\s]+)/);

if (match) {
  const queryString = match[1];
  const url = `${trustableUrl}?${queryString}`;
  console.log(`Trustable sign-in URL: ${url}`);
  console.log(`Direct Ollama Cloud URL: https://ollama.com/connect?${queryString}`);
  console.log(`Opening ${url}`);
  await openUrl(url);
} else {
  console.log(`Trustable URL: ${trustableUrl}`);
  console.log(`Opening ${trustableUrl}`);
  await openUrl(trustableUrl);
}

// Print version info
console.log(`Version: ${versionData!.version}`);
console.log(`Build: ${versionData!.build}`);
console.log(`Expiration: ${versionData!.expire}`);
