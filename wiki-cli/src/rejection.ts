/**
 * A failure the CLI predicted, explained, and refused on purpose — a slug
 * collision, a broken `[[link]]`, a page that does not exist.
 *
 * The distinction from an ordinary `Error` is what keeps self-reporting useful.
 * A rejection means the CLI worked: it validated input and said no. Filing those
 * upstream would bury the genuine crashes under everyone's typos, so the error
 * boundary prints a rejection and stops, and reports only what it did not
 * predict.
 *
 * This replaces the older `"<command> rejected: ..."` message-prefix convention,
 * which callers could only detect by matching on the text.
 */
export class Rejection extends Error {
  override readonly name = "Rejection";
}
