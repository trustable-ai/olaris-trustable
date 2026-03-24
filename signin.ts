/*
  Implement signin.ts with bun without dependencies
  Execute docker exec ollama ollama signin and print the output.
  Parse the output, you find a url starting with https://ollama.com/connect extract the query string.
  Invoke the browser to open http://trustable.miniops.me and add the query string.
  Otherwise just open the url without the query string.
  On Windows use powershell Start-Process to handle URLs with '&' in query strings.
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
  const url = `http://trustable.miniops.me?${queryString}`;
  openUrl(url);
  console.log(`Opening ${url}`);
} else {
  openUrl("http://trustable.miniops.me");
  console.log("Opening http://trustable.miniops.me");
}
