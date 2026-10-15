// Starts everything the app needs, in one terminal: the backend (which also runs the Telegram bot when a token is
// set) and the frontend. Ctrl+C stops both.
//
//   npm run dev:all            start as things are
//   npm run demo               restore the saved demo snapshot first, then start
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.join(root, "backend");
const python = path.join(backend, ".venv", "bin", "python");
const restoreDemo = process.argv.includes("--demo");

const colours = { backend: "\x1b[32m", frontend: "\x1b[36m", demo: "\x1b[35m" };
const reset = "\x1b[0m";
const say = (name, text) => process.stdout.write(`${colours[name]}[${name}]${reset} ${text}\n`);

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

function run(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  const relay = (stream) => {
    let buffered = "";
    stream.on("data", (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) say(name, line);
    });
  };
  relay(child.stdout);
  relay(child.stderr);
  return child;
}

if (!existsSync(python)) {
  console.error("The backend's Python environment is missing. Set it up first (see README.md, Setup).");
  process.exit(1);
}
for (const [port, name] of [[8000, "backend"], [5173, "frontend"]]) {
  if (await portInUse(port)) {
    console.error(`Port ${port} is already in use, so the ${name} is probably running in another terminal. Stop it first.`);
    process.exit(1);
  }
}

if (restoreDemo) {
  say("demo", "Restoring the demo snapshot…");
  const restored = await new Promise((resolve) => run("demo", python, ["-m", "app.demo_snapshot", "restore"], backend).on("exit", resolve));
  if (restored !== 0) process.exit(1);
}

const children = [
  run("backend", python, ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"], backend),
  run("frontend", "npx", ["vite", "--port", "5173", "--strictPort"], root),
];
say("frontend", "Open http://localhost:5173 once both have started. Ctrl+C stops everything.");

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGINT");
  setTimeout(() => process.exit(0), 1500);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// If either one stops on its own, stop the other too rather than leave half the app running.
for (const child of children) child.on("exit", stop);
