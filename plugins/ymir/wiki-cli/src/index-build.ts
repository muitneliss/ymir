import matter from "gray-matter";
import { join } from "node:path";
import { listPages, readPage } from "./store.js";

function entries(root: string, sub: string): string[] {
  return listPages(join(root, sub))
    .sort()
    .map((file) => {
      const fm = matter(readPage(join(root, sub, file))).data as { title?: string };
      const title = fm.title ?? file.replace(/\.md$/, "");
      return `- [${title}](${sub}/${file})`;
    });
}

export function buildIndex(root: string): string {
  const sources = entries(root, "sources");
  const notes = entries(root, "notes");
  const lines = ["# Wiki Index", ""];
  lines.push("## Sources", "");
  lines.push(...(sources.length ? sources : ["_none yet_"]), "");
  lines.push("## Notes", "");
  lines.push(...(notes.length ? notes : ["_none yet_"]), "");
  return lines.join("\n") + "\n";
}
