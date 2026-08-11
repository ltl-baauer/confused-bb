import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const packageRoot = process.cwd();
const output = resolve(packageRoot, "dist", "native", "bb-glass.node");
const nodeRoot = dirname(dirname(process.execPath));
const nodeHeaders = resolve(nodeRoot, "include", "node");

await mkdir(dirname(output), { recursive: true });
await run("clang++", [
  "-bundle",
  "-undefined",
  "dynamic_lookup",
  "-std=c++20",
  "-fobjc-arc",
  `-I${nodeHeaders}`,
  "-DNODE_GYP_MODULE_NAME=bb_glass",
  "-framework",
  "AppKit",
  resolve(packageRoot, "native", "bb-glass.mm"),
  "-o",
  output,
]);

process.stdout.write("@bb/desktop: built native glass module\n");
