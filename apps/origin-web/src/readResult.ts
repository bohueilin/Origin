// The shape every list reader in the app returns.
//
// A reader that answers with a bare array cannot say the one thing its caller most needs
// to know: whether an empty result is a FACT about the account or a QUESTION we failed to
// answer. Collapsing the two is how a failed load renders as a calm "nothing here yet" —
// the failure mode that hid the admin portal for a month, and the same one that let the
// account console report "No agent can act on your behalf yet" when it had read nothing
// at all.
//
// `rows` is always an array, so callers can map it unconditionally and stay fail-safe.
// `ok` is the fact they must branch on before rendering an empty state.

export type ReadResult<T> =
  | { ok: true; rows: T[]; error?: undefined }
  | { ok: false; rows: T[]; error: string }

/** Single-row variant: `row` is null both for "not found" and (with ok:false) "unknown". */
export type ReadOneResult<T> =
  | { ok: true; row: T | null; error?: undefined }
  | { ok: false; row: null; error: string }

export function readOk<T>(rows: T[]): ReadResult<T> {
  return { ok: true, rows }
}

export function readFail<T>(error: string): ReadResult<T> {
  return { ok: false, rows: [], error }
}

export function readOneOk<T>(row: T | null): ReadOneResult<T> {
  return { ok: true, row }
}

export function readOneFail<T>(error: string): ReadOneResult<T> {
  return { ok: false, row: null, error }
}

export const NOT_CONFIGURED = 'Accounts are not configured.'

/** "Couldn’t load the audit log — JWT expired." The section name keeps a raw database
 *  message legible; the raw message keeps the cause recoverable. */
export function loadFailure(what: string, raw?: string | null): string {
  return raw ? `Couldn’t load ${what} — ${raw}` : `Couldn’t load ${what}.`
}

/** Land a read in the (rows, error) pair a list view renders from. A failed read sets the
 *  error and leaves rows empty, so the empty state is only ever shown for something that is
 *  genuinely empty — never for something we could not read. */
export function applyRead<T>(res: ReadResult<T>, setRows: (rows: T[]) => void, setError: (error: string) => void): void {
  if (res.ok) { setError(''); setRows(res.rows) } else { setError(res.error); setRows([]) }
}

/** Normalize one `{ data, error }` SDK response into a ReadResult. A successful select
 *  always yields an array; anything else is a non-answer and must not read as empty. */
export function rowsFrom<T, R>(
  res: { data: unknown; error?: { message?: string } | null },
  map: (row: R) => T,
  what: string,
): ReadResult<T> {
  if (res.error) return readFail(loadFailure(what, res.error.message))
  if (!Array.isArray(res.data)) return readFail(loadFailure(what))
  return readOk((res.data as R[]).map(map))
}
