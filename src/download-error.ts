export type DownloadErrorCode =
  | 'VersionFileNotFound'
  | 'VersionFileNotAccessible'
  | 'VersionFileInvalid'
  | 'MajorVersionNotFound'
  | 'DatabaseFileNotFound'
  | 'DatabaseFileNotAccessible'
  | 'DatabaseFileHeaderMissing'
  | 'DatabaseFileHeaderDuplicate'
  | 'DatabaseFileVersionMismatch'
  | 'DatabaseFileInvalidJSON'
  | 'DatabaseFileInvalidRecord'
  | 'DatabaseTooOld'
  | 'Timeout';

type DownloadErrorOptions = { code: DownloadErrorCode; url: string };

export class DownloadError extends Error {
  code: DownloadErrorCode;
  url: string;

  constructor({ code, url }: DownloadErrorOptions, ...params: Array<any>) {
    super(...params);
    Object.setPrototypeOf(this, DownloadError.prototype);

    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, DownloadError);
    }

    this.name = 'DownloadError';
    this.code = code;
    this.url = url;
  }
}
