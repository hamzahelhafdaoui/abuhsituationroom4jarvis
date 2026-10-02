import { createFileRoute } from "@tanstack/react-router";
import { createWebHandler } from "../../../../quest-assistant/gateway/web-adapter.mjs";

const handle = createWebHandler();
export const Route = createFileRoute("/api/assistant/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      OPTIONS: ({ request }) => handle(request),
    },
  },
});
