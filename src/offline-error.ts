export class OfflineError extends Error {
  constructor(...params: Array<any>) {
    super(...params);
    Object.setPrototypeOf(this, OfflineError.prototype);

    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, OfflineError);
    }

    this.name = 'OfflineError';
  }
}
