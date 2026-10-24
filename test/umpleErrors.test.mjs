// Tests for reading umplesync's error JSON (no Java needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUmpleErrors } from "../build/umpleErrors.js";

// The real stderr of `-generate Nothing bad.ump` (Phase A, case 2).
const BAD =
  '{ "results" : [ { "errorCode" : "5", "severity" : "1", "url" : "https://manual.umple.org/?E005UndefinedClassinAssociation.html", "line" : "3", "filename" : "bad.ump", "message" : "Association end \'Course\' is not a class or interface"}]}';

test("reads a normal error and turns strings into numbers", () => {
  assert.deepEqual(parseUmpleErrors(BAD), {
    ok: true,
    problems: [
      {
        kind: "error",
        code: 5,
        severity: 1,
        file: "bad.ump",
        line: 3,
        message: "Association end 'Course' is not a class or interface",
        url: "https://manual.umple.org/?E005UndefinedClassinAssociation.html",
      },
    ],
  });
});

test("severity 1-2 is an error, 3 and above a warning", () => {
  const stderr = `{ "results" : [ ${[1, 2, 3, 4, 5]
    .map((s) => `{ "errorCode" : "1", "severity" : "${s}", "url" : "", "line" : "1", "filename" : "a.ump", "message" : "m"}`)
    .join(",")} ]}`;
  const result = parseUmpleErrors(stderr);
  assert.ok(result.ok);
  assert.deepEqual(
    result.problems.map((p) => p.kind),
    ["error", "error", "warning", "warning", "warning"],
  );
});

test("empty stderr means no problems", () => {
  assert.deepEqual(parseUmpleErrors(""), { ok: true, problems: [] });
});

test("empty results means no problems", () => {
  assert.deepEqual(parseUmpleErrors('{ "results" : [ ]}'), { ok: true, problems: [] });
});

test("ignores Java notices before the JSON", () => {
  const result = parseUmpleErrors(`Picked up JAVA_TOOL_OPTIONS: -Xmx512m\n${BAD}\n`);
  assert.ok(result.ok);
  assert.equal(result.problems[0].code, 5);
  assert.deepEqual(parseUmpleErrors("Picked up JAVA_TOOL_OPTIONS: -Xmx512m\n"), { ok: true, problems: [] });
});

test("reads a message with raw new lines and tabs (error 9000 stack dump)", () => {
  const stderr =
    '{ "results" : [ { "errorCode" : "9000", "severity" : "1", "url" : "https://manual.umple.org/?E9000.html", "line" : "1", "filename" : "a.ump", "message" : "Internal error\nStack dump follows\n\tat cruise.umple.Foo.bar(Foo.java:12)"}]}';
  const result = parseUmpleErrors(stderr);
  assert.ok(result.ok);
  assert.equal(result.problems[0].code, 9000);
  assert.equal(result.problems[0].message, "Internal error\nStack dump follows\n\tat cruise.umple.Foo.bar(Foo.java:12)");
});

test("returns the raw text when the output cannot be read", () => {
  assert.deepEqual(parseUmpleErrors('{ "results" : [ { broken'), { ok: false, raw: '{ "results" : [ { broken' });
  assert.deepEqual(parseUmpleErrors("Error: Unable to access jarfile x.jar"), {
    ok: false,
    raw: "Error: Unable to access jarfile x.jar",
  });
});

test("maps a base name back to its input path", () => {
  const stderr = BAD.replace('"bad.ump"', '"b.ump"');
  const result = parseUmpleErrors(stderr, { inputNames: ["main.ump", "lib/b.ump"] });
  assert.ok(result.ok);
  assert.equal(result.problems[0].file, "lib/b.ump");
});

test("keeps the base name when several input files share it", () => {
  const stderr = BAD.replace('"bad.ump"', '"x.ump"');
  const result = parseUmpleErrors(stderr, { inputNames: ["a/x.ump", "b/x.ump"] });
  assert.ok(result.ok);
  assert.equal(result.problems[0].file, "x.ump");
});

test("removes the temp folder path from file names, messages and raw output", () => {
  const dir = "/tmp/umple-mcp-abc123";
  const stderr = `{ "results" : [ { "errorCode" : "1510", "severity" : "3", "url" : "", "line" : "1", "filename" : "${dir}/lib/main.ump", "message" : "File '${dir}/missing.ump' referred to in use statement was not found"}]}`;
  const result = parseUmpleErrors(stderr, { inputNames: ["lib/main.ump"], folders: [dir] });
  assert.ok(result.ok);
  assert.equal(result.problems[0].file, "lib/main.ump");
  assert.equal(result.problems[0].message, "File 'missing.ump' referred to in use statement was not found");
  assert.deepEqual(parseUmpleErrors(`Exception in ${dir}/main.ump`, { folders: [dir] }), {
    ok: false,
    raw: "Exception in main.ump",
  });
});
