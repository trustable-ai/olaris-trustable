/*
  Implement signin.ts with bun without dependencies
  Invoke the browser to open http://trustable.miniops.me
  Execute docker exec ollama ollama signin and print the output.
  Parse the output, you find a url starting with https://ollama.com/connect
  invoke the browser to open also url
 */

const platform = process.platform;
const openCmd =
  platform === "darwin" ? "open" :
  platform === "win32" ? "start" :
  "xdg-open";

// Open the trustable page in the browser
Bun.spawn([openCmd, "http://trustable.miniops.me"]);

// Execute ollama signin
const proc = Bun.spawn(["docker", "exec", "ollama", "ollama", "signin"], {
  stdout: "pipe",
  stderr: "pipe",
});

const stdout = await new Response(proc.stdout).text();
const stderr = await new Response(proc.stderr).text();
const output = stdout + stderr;

console.log(output.trim());

const match = output.match(/(https:\/\/ollama\.com\/connect\S*)/);

if (match) {
  const url = match[1];
  Bun.spawn([openCmd, url]);
  console.log("Opening Ollama connect link in browser...");
}
