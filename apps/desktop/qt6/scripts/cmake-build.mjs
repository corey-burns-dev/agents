import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const qt6Dir = join(__dirname, "..");

function run(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, { cwd: qt6Dir, stdio: "inherit", ...opts });
	if (r.status !== 0) process.exit(r.status ?? 1);
}

run("cmake", ["-B", "build", "-S", "."]);
run("cmake", ["--build", "build"]);
