import { posix } from "node:path";

export interface UmpleProblem {
  kind: "error" | "warning";
  code: number;
  severity: number;
  file: string;
  line: number;
  message: string;
  url: string;
}

export type ParseResult =
  | { ok: true; problems: UmpleProblem[] }
  | { ok: false; raw: string }; // the output could not be read; raw is shown to the AI as is

export interface ParseOptions {
  // The file names that were sent, used to map "b.ump" back to "lib/b.ump".
  inputNames?: string[];
  // Folders to remove from file names and messages (the temp folder).
  folders?: string[];
}

// Reads the errors and warnings that umplesync.jar prints on stderr:
// { "results" : [ { "errorCode" : "5", "severity" : "1", "url" : "...", "line" : "3", "filename" : "bad.ump", "message" : "..." } ] }
// All values are strings. stderr can have other lines before the JSON
// (e.g. "Picked up JAVA_TOOL_OPTIONS: ..."), and messages can contain raw new lines.
export function parseUmpleErrors(stderr: string, options: ParseOptions = {}): ParseResult {
  const clean = (text: string) => removeFolders(text, options.folders ?? []);
  const start = stderr.search(/\{\s*"results"/);
  if (start === -1) {
    // No JSON: fine if stderr is empty or only has Java's notices, otherwise something went wrong.
    const rest = stderr
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "" && !line.startsWith("Picked up "));
    return rest.length === 0 ? { ok: true, problems: [] } : { ok: false, raw: clean(stderr) };
  }
  const json = stderr.slice(start, stderr.lastIndexOf("}") + 1);
  const data = parseLenient(json);
  if (!data || !Array.isArray(data.results)) {
    return { ok: false, raw: clean(stderr) };
  }
  const problems = data.results.map((item: Record<string, unknown>): UmpleProblem => {
    const severity = toNumber(item.severity);
    return {
      // Umple's own rule (ErrorMessage.toString): severity 1-2 is an error, 3 and above a warning.
      kind: severity <= 2 ? "error" : "warning",
      code: toNumber(item.errorCode),
      severity,
      file: toInputName(clean(String(item.filename ?? "")), options.inputNames ?? []),
      line: toNumber(item.line),
      message: clean(String(item.message ?? "")),
      url: String(item.url ?? ""),
    };
  });
  return { ok: true, problems };
}

// JSON.parse, and if that fails, retry after escaping raw control characters
// (new lines, tabs...) inside strings: umplesync only escapes \ and ".
function parseLenient(json: string): { results?: unknown } | undefined {
  for (const text of [json, escapeControlCharsInStrings(json)]) {
    try {
      return JSON.parse(text);
    } catch {
      // try the next form
    }
  }
  return undefined;
}

function escapeControlCharsInStrings(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      } else if (ch === "\n") {
        out += "\\n";
        continue;
      } else if (ch === "\r") {
        out += "\\r";
        continue;
      } else if (ch === "\t") {
        out += "\\t";
        continue;
      } else if (ch < " ") {
        out += "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
        continue;
      }
    } else if (ch === '"') {
      inString = true;
    }
    out += ch;
  }
  return out;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Removes "<folder>/" (and the folder itself) so messages show "missing.ump",
// not "/tmp/umple-mcp-xxx/missing.ump".
function removeFolders(text: string, folders: string[]): string {
  for (const folder of folders) {
    text = text.split(folder + "/").join("").split(folder + "\\").join("").split(folder).join("");
  }
  return text;
}

// umplesync reports only the base name ("b.ump" for "lib/b.ump").
// Map it back when exactly one input file has that base name; otherwise keep it as reported.
function toInputName(file: string, inputNames: string[]): string {
  if (inputNames.includes(file)) return file;
  const matches = inputNames.filter((name) => posix.basename(name) === file);
  return matches.length === 1 ? matches[0] : file;
}
