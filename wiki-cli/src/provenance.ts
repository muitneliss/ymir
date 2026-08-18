import { relative } from "node:path";
import { hashFile } from "./hash.js";

export interface Provenance {
  sourcePath: string;
  sourceHash: string;
}

export function fileProvenance(projectRoot: string, absPath: string): Provenance {
  return {
    sourcePath: relative(projectRoot, absPath),
    sourceHash: hashFile(absPath),
  };
}
