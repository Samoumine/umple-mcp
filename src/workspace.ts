import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

export interface UmpleFile {
  name: string; // relative path, e.g. "model.ump" or "lib/types.ump"
  content: string;
}

// Writes the files into a new private temp folder, runs `work` in it,
// and always deletes the folder afterwards, even when `work` fails.
export async function withWorkspace<T>(
  files: UmpleFile[],
  work: (dir: string) => Promise<T>,
): Promise<T> {
  // realpath: Java reports real paths, so use the same form when removing them from messages.
  const dir = await realpath(await mkdtemp(join(tmpdir(), "umple-mcp-")));
  try {
    for (const file of files) {
      const path = resolve(dir, file.name);
      // Names are checked before this, but never write outside the folder.
      if (!path.startsWith(dir + sep)) {
        throw new Error(`File name ${file.name} points outside the workspace.`);
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.content, "utf8");
    }
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
