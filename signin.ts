/*
  Implement signin.ts with bun without dependencies
  Accept an args as trustable url, defaults to http://trustable.miniops.me
  Execute docker exec ollama ollama signin and print the output.
  Parse the output, you find a url starting with https://ollama.com/connect extract the query string.
  Invoke the browser to open trustable url  and add the query string.
  Otherwise just open the trustable url without the query string.
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

const trustableUrl = process.argv[2] || "http://trustable.miniops.me";

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
