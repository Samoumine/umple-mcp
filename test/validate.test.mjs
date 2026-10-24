// Tests for umple_validate.
// "with Java" tests need UMPLESYNC_JAR and are skipped (with a message) when it isn't set.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { OneShotRunner, UmpleRunnerError } from "../build/umplesync.js";
import { checkFileName, validateInputSchema, validateUmple } from "../build/tools/validate.js";

const JAR = process.env.UMPLESYNC_JAR;
const BAD = "class Student {\n  name;\n  * -- * Course;\n}\n";

// Wraps a runner and remembers the temp folders it was given, to check they get deleted.
function tracking(runner) {
  const folders = [];
  return {
    folders,
    run(args, cwd) {
      folders.push(cwd);
      return runner.run(args, cwd);
    },
  };
}

function text(result) {
  return result.content.map((c) => c.text).join("\n");
}

describe("input rules (no Java)", () => {
  test("file names", () => {
    assert.equal(checkFileName("model.ump"), undefined);
    assert.equal(checkFileName("lib/types.ump"), undefined);
    assert.match(checkFileName("model.txt"), /\.ump/);
    assert.match(checkFileName("../model.ump"), /\.\./);
    assert.match(checkFileName("lib/../../model.ump"), /\.\./);
    assert.match(checkFileName("/tmp/model.ump"), /relative/);
    assert.match(checkFileName("C:/model.ump"), /relative/);
    assert.match(checkFileName("lib\\model.ump"), /\//);
  });

  const reject = (input, pattern) => {
    const result = validateInputSchema.safeParse(input);
    assert.equal(result.success, false);
    assert.match(result.error.issues.map((i) => i.message).join("\n"), pattern);
  };

  test("rejects empty or whitespace-only content", () => {
    reject({ files: [{ name: "a.ump", content: "" }] }, /empty/);
    reject({ files: [{ name: "a.ump", content: "  \n\t " }] }, /empty/);
  });

  test("rejects main when it isn't one of the files", () => {
    reject({ files: [{ name: "a.ump", content: "class A {}" }], main: "b.ump" }, /not one of the file names/);
  });

  test("rejects duplicate names, no files, and too much content", () => {
    reject({ files: [{ name: "a.ump", content: "class A {}" }, { name: "a.ump", content: "class B {}" }] }, /twice/);
    reject({ files: [] }, /./);
    reject({ files: [{ name: "a.ump", content: "x".repeat(1_000_001) }] }, /1 MB/);
  });

  test("accepts files in folders and a main", () => {
    const input = { files: [{ name: "main.ump", content: "use lib/b.ump;" }, { name: "lib/b.ump", content: "class B {}" }], main: "main.ump" };
    assert.equal(validateInputSchema.safeParse(input).success, true);
  });
});

describe("runner results (no Java, fake runner)", () => {
  test("temp folder is deleted even when the run fails", async () => {
    const runner = tracking({
      run: async () => {
        throw new UmpleRunnerError("boom");
      },
    });
    const result = await validateUmple({ files: [{ name: "lib/a.ump", content: "class A {}" }] }, runner);
    assert.equal(result.isError, true);
    assert.equal(text(result), "boom");
    assert.equal(runner.folders.length, 1);
    assert.equal(existsSync(runner.folders[0]), false);
  });

  test("the temp folder path never appears in the answer", async () => {
    const runner = tracking({
      run: async (_args, cwd) => ({
        stdout: "",
        stderr: `{ "results" : [ { "errorCode" : "1510", "severity" : "3", "url" : "", "line" : "1", "filename" : "${cwd}/main.ump", "message" : "File '${cwd}/missing.ump' referred to in use statement was not found"}]}`,
        exitCode: 0,
      }),
    });
    const result = await validateUmple({ files: [{ name: "main.ump", content: "use missing.ump;" }] }, runner);
    assert.equal(result.structuredContent.problems[0].file, "main.ump");
    assert.equal(result.structuredContent.problems[0].message, "File 'missing.ump' referred to in use statement was not found");
    assert.doesNotMatch(JSON.stringify(result), /umple-mcp-/);
  });

  test("unreadable output is a tool error that shows the raw text", async () => {
    const runner = { run: async () => ({ stdout: "", stderr: "Exception in thread main", exitCode: 1 }) };
    const result = await validateUmple({ files: [{ name: "a.ump", content: "class A {}" }] }, runner);
    assert.equal(result.isError, true);
    assert.match(text(result), /Exception in thread main/);
  });
});

describe("with Java (real umplesync.jar)", { skip: JAR ? false : "UMPLESYNC_JAR is not set: Java tests skipped" }, () => {
  const runner = tracking(new OneShotRunner(JAR));
  const validate = (files, main) => validateUmple({ files, main }, runner);

  after(() => {
    // Every temp folder used by these tests is gone.
    assert.ok(runner.folders.length > 0);
    for (const folder of runner.folders) assert.equal(existsSync(folder), false, `${folder} was not deleted`);
  });

  test("correct model: valid, no problems", async () => {
    const result = await validate([{ name: "good.ump", content: "class Student { name; }\nclass Course { title; }\nassociation { * Student -- * Course; }\n" }]);
    assert.deepEqual(result.structuredContent, { valid: true, errorCount: 0, warningCount: 0, problems: [] });
    assert.equal(text(result), "Valid: 0 errors, 0 warnings.");
  });

  test("bad.ump: error 5, line 3, severity 1, manual link", async () => {
    const result = await validate([{ name: "bad.ump", content: BAD }]);
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.valid, false);
    assert.deepEqual(result.structuredContent.problems, [
      {
        kind: "error",
        code: 5,
        severity: 1,
        file: "bad.ump",
        line: 3,
        message: "Association end 'Course' is not a class or interface",
        url: "https://manual.umple.org/?E005UndefinedClassinAssociation.html",
      },
    ]);
    assert.match(text(result), /^Not valid: 1 error, 0 warnings\.\n- error E5 in bad\.ump line 3: /);
  });

  test("warning only: valid, with the warnings listed", async () => {
    const result = await validate([{ name: "warn.ump", content: "class Student {\n  name;\n  * -- 0..1 Mentor Mentor;\n}\nclass Mentor { name; }\n" }]);
    assert.equal(result.structuredContent.valid, true);
    assert.equal(result.structuredContent.errorCount, 0);
    assert.ok(result.structuredContent.problems.some((p) => p.kind === "warning" && p.code === 89));
    assert.match(text(result), /W89 in warn\.ump line 3/);
  });

  test("two files with use: valid", async () => {
    const result = await validate([
      { name: "main.ump", content: "use other.ump;\nclass Student { name; * -- * Course; }\n" },
      { name: "other.ump", content: "class Course { title; }\n" },
    ]);
    assert.equal(result.structuredContent.valid, true);
    assert.equal(result.structuredContent.problems.length, 0);
  });

  test("error inside the used file is reported in that file", async () => {
    const result = await validate([
      { name: "main.ump", content: "use other.ump;\nclass Student { name; }\n" },
      { name: "other.ump", content: "class Course {\n  title;\n  * -- * Teacher;\n}\n" },
    ]);
    assert.equal(result.structuredContent.problems[0].file, "other.ump");
    assert.equal(result.structuredContent.problems[0].line, 3);
  });

  test("error inside lib/b.ump is reported as lib/b.ump, not b.ump", async () => {
    const result = await validate([
      { name: "main.ump", content: "use lib/b.ump;\nclass Student { name; }\n" },
      { name: "lib/b.ump", content: "class Course {\n  * -- * Teacher;\n}\n" },
    ]);
    assert.equal(result.structuredContent.problems[0].file, "lib/b.ump");
    assert.match(text(result), /in lib\/b\.ump line 2/);
  });

  test("main in a folder", async () => {
    const result = await validate([{ name: "lib/bad.ump", content: BAD }], "lib/bad.ump");
    assert.equal(result.structuredContent.problems[0].file, "lib/bad.ump");
  });

  test("use of a file that wasn't sent: warning 1510, no temp path in the message", async () => {
    const result = await validate([{ name: "main.ump", content: "use missing.ump;\nclass A { name; }\n" }]);
    const problem = result.structuredContent.problems[0];
    assert.equal(problem.code, 1510);
    assert.equal(problem.kind, "warning");
    assert.match(problem.message, /'missing\.ump'/);
    assert.match(text(result), /W1510/);
    assert.doesNotMatch(JSON.stringify(result), /umple-mcp-/);
  });

  test("wrong jar path: tool error", async () => {
    const result = await validateUmple({ files: [{ name: "a.ump", content: "class A {}" }] }, new OneShotRunner("/nope/umplesync.jar"));
    assert.equal(result.isError, true);
  });
});

// Starts the real server like an AI tool does, with the given environment.
async function connect(env) {
  const client = new Client({ name: "test", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["build/index.js"], env, stderr: "ignore" }));
  return client;
}

describe("through MCP (real server)", () => {
  let client;
  before(async () => {
    client = await connect(JAR ? { UMPLESYNC_JAR: JAR } : {});
  });
  after(() => client.close());

  test("lists umple_validate with its title, annotations and schemas", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name), ["umple_validate"]);
    const tool = tools[0];
    assert.equal(tool.title, "Validate Umple model");
    assert.deepEqual(tool.annotations, { readOnlyHint: true, openWorldHint: false });
    assert.match(tool.description, /Errors in the model are a normal answer, not a tool failure: fix the Umple code and call this tool again until it is valid\.$/);
    assert.deepEqual(tool.inputSchema.required, ["files"]);
    assert.ok(tool.outputSchema.properties.problems);
  });

  test("empty content: clear invalid-input error", async () => {
    const result = await client.callTool({ name: "umple_validate", arguments: { files: [{ name: "a.ump", content: " " }] } });
    assert.equal(result.isError, true);
    assert.match(text(result), /File "a\.ump" is empty/);
  });

  test("main not among the files: rejected", async () => {
    const result = await client.callTool({ name: "umple_validate", arguments: { files: [{ name: "a.ump", content: "class A {}" }], main: "b.ump" } });
    assert.equal(result.isError, true);
    assert.match(text(result), /not one of the file names/);
  });

  test("UMPLESYNC_JAR not set: clear error, server keeps working", async () => {
    const noJar = await connect({});
    try {
      const args = { name: "umple_validate", arguments: { files: [{ name: "a.ump", content: "class A {}" }] } };
      for (let i = 0; i < 2; i++) {
        const result = await noJar.callTool(args);
        assert.equal(result.isError, true);
        assert.match(text(result), /UMPLESYNC_JAR is not set/);
      }
    } finally {
      await noJar.close();
    }
  });

  test("Java missing: clear error", { skip: JAR ? false : "UMPLESYNC_JAR is not set: Java tests skipped" }, async () => {
    const noJava = await connect({ UMPLESYNC_JAR: JAR, PATH: "/nonexistent" });
    try {
      const result = await noJava.callTool({ name: "umple_validate", arguments: { files: [{ name: "a.ump", content: "class A {}" }] } });
      assert.equal(result.isError, true);
      assert.match(text(result), /Java was not found on the PATH/);
    } finally {
      await noJava.close();
    }
  });

  test("bad.ump through MCP", { skip: JAR ? false : "UMPLESYNC_JAR is not set: Java tests skipped" }, async () => {
    const result = await client.callTool({ name: "umple_validate", arguments: { files: [{ name: "bad.ump", content: BAD }] } });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.errorCount, 1);
    assert.equal(result.structuredContent.problems[0].code, 5);
  });
});

describe("workspace", () => {
  test("files in subfolders are written, then removed", async () => {
    const { withWorkspace } = await import("../build/workspace.js");
    const { readFile } = await import("node:fs/promises");
    let seen;
    const content = await withWorkspace([{ name: "lib/a.ump", content: "class A {}" }], async (dir) => {
      seen = dir;
      return readFile(`${dir}/lib/a.ump`, "utf8");
    });
    assert.equal(content, "class A {}");
    assert.match(seen, /umple-mcp-/);
    assert.equal(existsSync(seen), false);
  });
});
