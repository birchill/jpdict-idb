import { AbortError } from './abort-error';
import { DownloadError } from './download-error';
import { isObject } from './is-object';

export function isAbortError(e: unknown): e is AbortError {
  return isObject(e) && 'name' in e && e.name === 'AbortError';
}

export function isDownloadError(e: unknown): e is DownloadError {
  return isObject(e) && 'name' in e && e.name === 'DownloadError';
}

export function getErrorMessage(e: unknown): string {
  return isObject(e) && typeof e.message === 'string' ? e.message : String(e);
}
