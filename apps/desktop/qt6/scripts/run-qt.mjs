import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const qt6Dir = join(__dirname, "..");

let exe = join(qt6Dir, "build", "agents_qt6");
if (process.platform === "win32") {
	exe += ".exe";
	if (!existsSync(exe)) {
		const releaseExe = join(qt6Dir, "build", "Release", "agents_qt6.exe");
		if (existsSync(releaseExe)) exe = releaseExe;
	}
}

if (!existsSync(exe)) {
	console.error("Qt6 app not built. Run: bun run build:qt6");
	process.exit(1);
}

const child = spawn(exe, [], {
	cwd: qt6Dir,
	env: process.env,
	stdio: "inherit",
});

child.on("exit", (code) => {
	process.exit(code ?? 0);
});
