import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ping-chat")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        try {
          const { chatWithArwa } = await import("@/lib/arwa/chat");
          const result = await chatWithArwa({
            userId: "ping",
            text: "كيفك",
            name: "فحص",
            isOwner: true,
          });
          return Response.json({
            ok: true,
            ms: Date.now() - started,
            text: (result.text || "").slice(0, 200),
          });
        } catch (err) {
          return Response.json({
            ok: false,
            ms: Date.now() - started,
            error: err instanceof Error ? err.message.slice(0, 240) : String(err),
          });
        }
      },
    },
  },
});
