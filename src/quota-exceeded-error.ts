export class QuotaExceededError extends Error {
  constructor(...params: Array<any>) {
    super(...params);
    Object.setPrototypeOf(this, QuotaExceededError.prototype);

    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, QuotaExceededError);
    }

    this.name = 'QuotaExceededError';
    this.message = 'The current transaction exceeded its quota limitations.';
  }
}
