import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { parseUmpleErrors, type UmpleProblem } from "../umpleErrors.js";
import { OneShotRunner, UmpleRunnerError, type UmpleRunner } from "../umplesync.js";
import { withWorkspace } from "../workspace.js";

const MAX_FILES = 50;
const MAX_TOTAL_BYTES = 1_000_000;

// Returns why a file name is not allowed, or undefined if it is fine.
// Allowed: relative paths with "/" ending in .ump, e.g. "model.ump" or "lib/types.ump".
export function checkFileName(name: string): string | undefined {
  if (!name.endsWith(".ump")) return "must end in .ump";
  if (name.includes("\\")) return 'must use "/" between folders, not "\\"';
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return "must be a relative path";
  if (name.split("/").some((part) => part === "" || part === "." || part === "..")) {
    return 'must not contain "..", "." or empty parts';
  }
  return undefined;
}

export const validateInputSchema = z
  .object({
    files: z
      .array(
        z.object({
          name: z.string().describe('Relative path of the file, ending in .ump, e.g. "model.ump" or "lib/types.ump"'),
          content: z.string().describe("The Umple code in this file"),
        }),
      )
      .min(1)
      .max(MAX_FILES)
      .describe("All the files of the model, including every file referenced by a use statement"),
    main: z.string().optional().describe("The file to start from. Default: the first file"),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    let totalBytes = 0;
    input.files.forEach((file, i) => {
      const problem = checkFileName(file.name);
      if (problem) {
        ctx.addIssue({ code: "custom", path: ["files", i, "name"], message: `File name "${file.name}" ${problem}` });
      }
      if (seen.has(file.name)) {
        ctx.addIssue({ code: "custom", path: ["files", i, "name"], message: `File "${file.name}" is listed twice` });
      }
      seen.add(file.name);
      if (file.content.trim() === "") {
        ctx.addIssue({ code: "custom", path: ["files", i, "content"], message: `File "${file.name}" is empty` });
      }
      totalBytes += Buffer.byteLength(file.content, "utf8");
    });
    if (totalBytes > MAX_TOTAL_BYTES) {
      ctx.addIssue({ code: "custom", path: ["files"], message: "The files are larger than 1 MB in total" });
    }
    if (input.main !== undefined && !seen.has(input.main)) {
      ctx.addIssue({ code: "custom", path: ["main"], message: `main "${input.main}" is not one of the file names` });
    }
  });

export type ValidateInput = z.infer<typeof validateInputSchema>;

export const validateOutputSchema = z.object({
  valid: z.boolean().describe("true when there are no errors (warnings are allowed)"),
  errorCount: z.number(),
  warningCount: z.number(),
  problems: z.array(
    z.object({
      kind: z.enum(["error", "warning"]),
      code: z.number().describe("Umple error or warning number"),
      severity: z.number().describe("1-2: error, 3 and above: warning"),
      file: z.string(),
      line: z.number(),
      message: z.string(),
      url: z.string().describe("Page in the Umple manual about this problem"),
    }),
  ),
});

export const VALIDATE_DESCRIPTION = [
  "Check Umple code (.ump files) with the Umple compiler and return its errors and warnings,",
  "each with the file, line, message and a link to the Umple manual.",
  "Send every file of the model, including every file referenced by a `use` statement:",
  "a used file that was not sent only shows up as warning 1510.",
  "`main` is the file to start from (default: the first file).",
  "`valid: true` means there are no errors. Warnings may still be listed and are worth fixing.",
  "Errors in the model are a normal answer, not a tool failure: fix the Umple code and call this tool again until it is valid.",
].join("\n");

// Checks the model with the given runner and builds the answer for the AI.
export async function validateUmple(input: ValidateInput, runner: UmpleRunner) {
  const main = input.main ?? input.files[0].name;
  const names = input.files.map((file) => file.name);
  try {
    const outcome = await withWorkspace(input.files, async (dir) => {
      // "Nothing" checks the model and generates nothing.
      const result = await runner.run(["-generate", "Nothing", main], dir);
      return { result, parsed: parseUmpleErrors(result.stderr, { inputNames: names, folders: [dir] }) };
    });
    const { result, parsed } = outcome;
    if (!parsed.ok) {
      return toolError(`Could not read the output of umplesync.jar:\n${parsed.raw}`);
    }
    // The exit code does not reflect model errors, so only use it when there is no other answer.
    if (result.exitCode !== 0 && parsed.problems.length === 0) {
      return toolError(`umplesync.jar stopped with exit code ${result.exitCode}.`);
    }
    return report(parsed.problems);
  } catch (error) {
    if (error instanceof UmpleRunnerError) return toolError(error.message);
    return toolError(`umple_validate failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function report(problems: UmpleProblem[]) {
  const errorCount = problems.filter((p) => p.kind === "error").length;
  const warningCount = problems.length - errorCount;
  const valid = errorCount === 0;
  const lines = [
    `${valid ? "Valid" : "Not valid"}: ${plural(errorCount, "error")}, ${plural(warningCount, "warning")}.`,
    ...problems.map((p) => {
      const link = p.url ? ` (${p.url})` : "";
      return `- ${p.kind} ${p.kind === "error" ? "E" : "W"}${p.code} in ${p.file} line ${p.line}: ${p.message}${link}`;
    }),
  ];
  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    structuredContent: { valid, errorCount, warningCount, problems },
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// The tool itself failed (not the model): the AI sees isError and the reason.
function toolError(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

export function registerValidateTool(server: McpServer, runner: UmpleRunner = new OneShotRunner()) {
  server.registerTool(
    "umple_validate",
    {
      title: "Validate Umple model",
      description: VALIDATE_DESCRIPTION,
      inputSchema: validateInputSchema,
      outputSchema: validateOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => validateUmple(input, runner),
  );
}
