// Argument handling shared by the harness entry points. Call it first, before any model
// call, network fetch or file write.
//
//   -h / --help      print `usage` to stdout and exit 0
//   unknown argument print the problem and a pointer to --help to stderr and exit 2
//   flag with no value  same, exit 2
//
// `flags` maps each accepted flag to "boolean" or "value". The result maps a flag to
// true (boolean) or to its string (value); flags that were not given are absent.
import { writeSync } from "node:fs";

// writeSync, not console.log: the process exits right after, and an async pipe write can be cut off.
const write = (fd, text) => writeSync(fd, text.endsWith("\n") ? text : `${text}\n`);

function fail(message) {
  write(2, `error: ${message}\nRun with --help for usage.`);
  process.exit(2);
}

export function parseCli({ usage, flags }, argv = process.argv.slice(2)) {
  if (argv.includes("-h") || argv.includes("--help")) {
    write(1, usage);
    process.exit(0);
  }
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const kind = Object.hasOwn(flags, arg) ? flags[arg] : undefined;
    if (!kind) fail(`unknown argument: ${arg}`);
    if (kind === "value") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) fail(`${arg} needs a value`);
      values[arg] = next;
      i++;
    } else {
      values[arg] = true;
    }
  }
  return values;
}
