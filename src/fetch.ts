import { DownloadError } from './download-error.js';
import { isAbortError } from './error-parsing.js';

// Utility function for fetch that allows setting a timeout as well as taking an
// AbortController so that the callee can abort the request before that point
// too.
//
// If it times out the `response` Promise will reject with a TimeoutError
// so that a timeout can be distinguished from a deliberate abort.
export async function fetchWithTimeout(
  resource: RequestInfo,
  options: { timeout: number | null } & RequestInit
): Promise<Response> {
  // Set up abort controller
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options?.signal?.addEventListener('abort', onAbort);

  // Set up timeout callback
  const { timeout } = options;
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeout && timeout !== Infinity) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeout);
  }

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return response;
  } catch (e) {
    // Check for a timeout
    if (didTimeout && isAbortError(e)) {
      throw new DownloadError(
        {
          code: 'Timeout',
          url: typeof resource === 'string' ? resource : resource.url,
        },
        `Download timed out after ${timeout! / 1000} second(s).`
      );
    }

    throw e;
  } finally {
    options?.signal?.removeEventListener('abort', onAbort);
  }
}
