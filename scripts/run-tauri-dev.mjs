import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const cargoBin = `${process.env.USERPROFILE ?? ""}\\.cargo\\bin`;
const nodeBin = path.dirname(process.execPath);
const env = { ...process.env };
const npmExecPath = process.env.npm_execpath;

if (cargoBin && !env.PATH?.toLowerCase().includes(cargoBin.toLowerCase())) {
  env.PATH = env.PATH ? `${cargoBin};${env.PATH}` : cargoBin;
}

if (nodeBin && !env.PATH?.toLowerCase().includes(nodeBin.toLowerCase())) {
  env.PATH = env.PATH ? `${nodeBin};${env.PATH}` : nodeBin;
}

if (!npmExecPath) {
  console.error("npm_execpath ist nicht gesetzt. Tauri-Start kann nicht vorbereitet werden.");
  process.exit(1);
}

const child = spawn(process.execPath, [npmExecPath, "exec", "tauri", "dev", "--", "--config", "apps/desktop/src-tauri/tauri.conf.json"], {
  stdio: "inherit",
  env
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
