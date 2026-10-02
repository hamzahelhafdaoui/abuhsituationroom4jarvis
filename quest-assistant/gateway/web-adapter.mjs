import { createHandler } from "./server.mjs";

/** Mount the same authenticated gateway inside an existing TanStack/Vercel application. */
export function createWebHandler(env = process.env, fetcher = fetch) {
  const gateway = createHandler(env, fetcher);
  return async function handle(request) {
    const url = new URL(request.url);
    const headers = Object.fromEntries(request.headers.entries());
    const req = {
      method: request.method, headers,
      url: url.pathname.replace(/^\/api\/assistant/, "") + url.search,
      async *[Symbol.asyncIterator]() {
        if (!request.body) return;
        const reader = request.body.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            yield Buffer.from(value);
          }
        } finally { reader.releaseLock(); }
      },
    };
    const responseHeaders = new Headers();
    let code = 200, body = null;
    const res = {
      setHeader(name, value) { responseHeaders.set(name, String(value)); },
      writeHead(status, values = {}) {
        code = status;
        for (const [name, value] of Object.entries(values)) responseHeaders.set(name, String(value));
      },
      end(value) { body = value === undefined ? null : typeof value === "string" ? value : new Uint8Array(value); },
    };
    await gateway(req, res);
    return new Response(body, { status: code, headers: responseHeaders });
  };
}
