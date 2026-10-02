export function createWebHandler(
  env?: Record<string, string | undefined>, fetcher?: typeof fetch
): (request: Request) => Promise<Response>;
