import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hashFile(path: string): string {
  return sha256Hex(readFileSync(path));
}
