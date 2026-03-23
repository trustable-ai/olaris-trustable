/*
  Implement with bun without dependencies
  Execute docker exec ollama ollama signin
  and parse the output.
  If you find a url starting with https://ollama.com/connect
  invoke the browser to open that url
  and terminate with "Please follow the link to login"
  Otherwise just print the returned message
*/

const proc = Bun.spawn(["docker", "exec", "ollama", "ollama", "signin"], {
  stdout: "pipe",
  stderr: "pipe",
});

const stdout = await new Response(proc.stdout).text();
const stderr = await new Response(proc.stderr).text();
const output = stdout + stderr;

const match = output.match(/(https:\/\/ollama\.com\/connect\S*)/);

if (match) {
  const url = match[1];
  const platform = process.platform;
  const openCmd =
    platform === "darwin" ? "open" :
    platform === "win32" ? "start" :
    "xdg-open";

  Bun.spawn([openCmd, url]);
  console.log("Please follow the link to login");
} else {
  console.log(output.trim());
}
