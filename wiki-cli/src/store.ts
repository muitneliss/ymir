import {
  mkdirSync, writeFileSync, readFileSync, readdirSync,
  existsSync, appendFileSync, statSync,
} from "node:fs";
import { dirname } from "node:path";
import { Rejection } from "./rejection.js";

/**
 * Refuse a write whose target is occupied by a directory.
 *
 * Node reports this as `EISDIR: illegal operation on a directory, open
 * 'wiki/index.md'` — an errno with no remedy, which the error boundary then
 * offers to file upstream as an Ymir bug (issue #58). It is neither: a directory
 * standing where a page belongs is a broken working tree, usually a half-applied
 * merge, and only the person holding that tree can fix it. So predict it, name
 * it, and say what to do.
 */
function refuseIfDirectory(path: string): void {
  try {
    if (!statSync(path).isDirectory()) return;
  } catch {
    return; // Missing, or unreadable for some other reason the write will report.
  }
  throw new Rejection(
    `${path} is a directory, but this wiki page must be a file — remove or rename it, then re-run.`,
  );
}

export function writePage(path: string, content: string): void {
  refuseIfDirectory(path);
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
  refuseIfDirectory(path);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${line}\n`, "utf8");
}
