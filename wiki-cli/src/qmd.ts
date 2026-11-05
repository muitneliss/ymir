import { Rejection } from "./rejection.js";

/** How a user gets qmd; search and indexing both shell out to it. */
export const QMD_INSTALL_HINT =
  "install it with: bun install -g @tobilu/qmd (or: npm install -g @tobilu/qmd)";

/**
 * Refuse a search when qmd is not installed.
 *
 * The search side is the one part of this CLI that is not self-contained: it
 * shells out to qmd, which the user installs themselves. When it is absent the
 * runtime reports `Executable not found in $PATH: "qmd"` — an errno with no
 * remedy, which the error boundary then offers to file upstream as an Ymir bug
 * (issue #74). It is neither: a missing tool is a machine's setup, and only the
 * person holding that machine can fix it. So predict it, name it, and say what
 * to do.
 */
export class QmdMissing extends Rejection {
  constructor() {
    super(
      "qmd is not installed, so this wiki cannot be searched — " +
        `${QMD_INSTALL_HINT}, then run: wiki reindex`,
    );
  }
}

/**
 * Refuse a search when this wiki has no qmd collection and none could be made.
 *
 * qmd's registry is machine-global, but the collection is named for the
 * directory holding `wiki/` — so a fresh git worktree or clone has a name qmd
 * has never heard of, and `qmd search -c <name>` dies with "Collection not
 * found". The error boundary then filed that as an Ymir bug (issues #79-#82).
 * It is not one: a checkout without a registration is machine setup. `query`
 * registers the collection itself first; this is what is left when that fails.
 */
export class QmdCollectionMissing extends Rejection {
  constructor(collection: string) {
    super(
      `this wiki has no qmd collection ("${collection}"), so it cannot be searched — ` +
        "run: wiki reindex",
    );
  }
}

/** True for the spawn failure that means the executable is not on PATH. */
export const isMissingExecutable = (e: unknown): boolean =>
  (e as NodeJS.ErrnoException | null)?.code === "ENOENT";
