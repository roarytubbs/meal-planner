import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [];
let shuttingDown = false;

function start(name, script) {
  const child = spawn(npmCommand, ["run", script], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      shuttingDown = true;
      for (const processChild of children) {
        if (processChild.pid && processChild.pid !== child.pid) {
          processChild.kill("SIGTERM");
        }
      }
      process.exit(code ?? (signal ? 1 : 0));
    }
  });

  children.push(child);
  console.log(`[dev] started ${name}`);
}

function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (child.pid) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start("api", "dev:server");
start("client", "dev:client");
