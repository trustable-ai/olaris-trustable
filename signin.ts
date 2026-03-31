export {};
/*
  Implement signin.ts with bun without dependencies
  Accept an args as trustable <url>, defaults to http://trustable.miniops.me
  Connect to <url>/api/version and check it returns something like `{"build":"trustabledev_0.3.2-alpha_26.090.1013","expire":"2026/06/30","version":"Trustable v0.3.2-alpha"}`
  Retry up to 10 seconds until is available (1 second interval) otherwise give up with an error
  Execute `docker exec ollama ollama signin` and print the output.
  Parse the output, you find a url starting with https://ollama.com/connect extract the query string.
  Invoke the browser to open trustable url  and add the query string.
  Otherwise just open the trustable url without the query string.
  On Windows use powershell Start-Process to handle URLs with '&' in query strings.
  Complete printing version, build and expiration.
 */

const platform = process.platform;

function openUrl(url: string) {
  if (platform === "darwin") {
    Bun.spawn(["open", url]);
  } else if (platform === "win32") {
    Bun.spawn(["powershell", "-Command", `Start-Process '${url}'`]);
  } else {
    Bun.spawn(["xdg-open", url]);
  }
}

const trustableUrl = process.argv[2] || "http://trustable.miniops.me";

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
  openUrl(url);
  console.log(`Opening ${url}`);
} else {
  openUrl(trustableUrl);
  console.log(`Opening ${trustableUrl}`);
}

// Print version info
console.log(`Version: ${versionData!.version}`);
console.log(`Build: ${versionData!.build}`);
console.log(`Expiration: ${versionData!.expire}`);
