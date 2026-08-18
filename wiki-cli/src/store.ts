import {
  mkdirSync, writeFileSync, readFileSync, readdirSync,
  existsSync, appendFileSync,
} from "node:fs";
import { dirname } from "node:path";

export function writePage(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

export function readPage(path: string): string {
  return readFileSync(path, "utf8");
}

export function listPages(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md"));
}

export function appendFileLine(path: string, line: string): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${line}\n`, "utf8");
}
