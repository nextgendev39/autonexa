import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type SourceSelect = { table: string; select: string; file: string };

/** Every `.from("table").select(...)` in the source whose select text is known statically. */
export function selectsInSource(): SourceSelect[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(path)) files.push(path);
    }
  };
  walk(join(process.cwd(), "src"));

  const found = new Map<string, SourceSelect>();
  for (const file of files) {
    if (file.includes("/lib/db/") || file.includes("/privileged/")) continue;
    const source = readFileSync(file, "utf8");
    const constants = new Map<string, string>();
    for (const m of source.matchAll(/const ([A-Za-z_]+)\s*=\s*(?:\n\s*)?(["`])([\s\S]*?)\2/g)) {
      constants.set(m[1], m[3]);
    }
    const calls = source.matchAll(
      /\.from\(\s*"([a-z_]+)"(?:\s+as\s+never)?,?\s*\)\s*\.select\(\s*(?:(["`])([\s\S]*?)\2|([A-Za-z_]+))/g,
    );
    for (const m of calls) {
      const select = m[3] ?? constants.get(m[4]);
      if (!select || select.includes("${")) continue;
      found.set(`${m[1]}|${select}`, {
        table: m[1],
        select,
        file: file.slice(process.cwd().length + 1),
      });
    }
  }
  return [...found.values()];
}

export type SelectItem =
  | { kind: "column"; name: string }
  | { kind: "embed"; target: string; hint: string | null; children: SelectItem[] };

/** Splits a PostgREST select into its columns and embeds, nested embeds included. */
export function parseSelect(select: string): SelectItem[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of select) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): SelectItem => {
      const open = part.indexOf("(");
      if (open === -1) {
        // `alias:column::cast` and `column->json` reduce to the column they read.
        const column = part.split(":").filter(Boolean)[part.includes("::") ? 0 : part.split(":").length - 1];
        return { kind: "column", name: column.split(/->|::/)[0].trim() };
      }
      const head = part.slice(0, open).trim();
      const unaliased = head.includes(":") ? head.slice(head.indexOf(":") + 1) : head;
      const [target, hint] = unaliased.split("!");
      return {
        kind: "embed",
        target: target.trim(),
        hint: hint?.trim() && hint.trim() !== "inner" && hint.trim() !== "left" ? hint.trim() : null,
        children: parseSelect(part.slice(open + 1, part.lastIndexOf(")"))),
      };
    });
}
