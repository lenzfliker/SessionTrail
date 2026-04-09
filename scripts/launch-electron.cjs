const { spawn } = require("node:child_process");
const { join } = require("node:path");

const electronBinary = join(__dirname, "..", "node_modules", "electron", "dist", "electron.exe");
const entryTarget = process.argv[2] ?? ".";
const env = {
  ...process.env
};
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [entryTarget], {
  cwd: join(__dirname, ".."),
  stdio: "inherit",
  env
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
