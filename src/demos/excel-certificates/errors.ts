// Why a visitor's file could not be used. The UI turns each code into a
// friendly sentence in the visitor's language (see text.ts).

export type ListErrorCode =
  | 'too_big' // over MAX_FILE_BYTES
  | 'xls' // old binary .xls, or a password-protected workbook (both are OLE2 files)
  | 'numbers' // an Apple Numbers document
  | 'docx' // a Word document
  | 'not_list' // an image, a PDF, a random binary…
  | 'corrupt' // claims to be .xlsx but cannot be read
  | 'empty' // nothing in it
  | 'too_many_rows'; // over MAX_ROWS

export class ListError extends Error {
  code: ListErrorCode;
  /** For too_many_rows: how many rows the list has. */
  count?: number;
  constructor(code: ListErrorCode, count?: number) {
    super(code);
    this.name = 'ListError';
    this.code = code;
    this.count = count;
  }
}

/** Biggest file the demo opens (an .xlsx with 2,000 rows is well under 1 MB). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Most data rows the demo reads from one list. */
export const MAX_ROWS = 2000;
