import { execFile } from "node:child_process";
import { existsSync } from "node:fs";

// What one run of umplesync.jar gives back.
export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Runs umplesync.jar with the given arguments, inside the given folder.
// Step 2b adds a second runner (server mode) behind this same interface.
export interface UmpleRunner {
  run(args: string[], cwd: string): Promise<RunResult>;
}

// A problem with the tool itself (no jar, no Java, timeout), not with the model.
export class UmpleRunnerError extends Error {}

// Reads the jar path from UMPLESYNC_JAR and checks that the file exists.
export function jarFromEnv(): string {
  const jar = process.env.UMPLESYNC_JAR;
  if (!jar) {
    throw new UmpleRunnerError(
      "UMPLESYNC_JAR is not set. Set it to the path of umplesync.jar (for example ~/umple/dist/umplesync.jar).",
    );
  }
  if (!existsSync(jar)) {
    throw new UmpleRunnerError(`UMPLESYNC_JAR is set to ${jar}, but that file does not exist.`);
  }
  return jar;
}

// One-shot mode: starts a new `java -jar umplesync.jar ...` for every call.
export class OneShotRunner implements UmpleRunner {
  // jar: path to umplesync.jar. When not given, UMPLESYNC_JAR is read at each run.
  constructor(
    private readonly jar?: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async run(args: string[], cwd: string): Promise<RunResult> {
    const jar = this.jar ?? jarFromEnv();
    return new Promise((resolve, reject) => {
      execFile(
        "java",
        ["-jar", jar, ...args],
        { cwd, timeout: this.timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ stdout, stderr, exitCode: 0 });
            return;
          }
          const code: unknown = (error as { code?: unknown }).code;
          if (code === "ENOENT") {
            reject(new UmpleRunnerError("Java was not found on the PATH. Install Java 17 or later."));
          } else if (error.killed) {
            reject(new UmpleRunnerError(`umplesync.jar did not finish within ${this.timeoutMs / 1000} s.`));
          } else if (typeof code === "number") {
            // Java ran and exited with a non-zero code: let the caller decide.
            resolve({ stdout, stderr, exitCode: code });
          } else {
            reject(new UmpleRunnerError(`Could not run umplesync.jar: ${error.message}`));
          }
        },
      );
    });
  }
}
