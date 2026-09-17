import { createFileRoute } from "@tanstack/react-router";
import fs from "node:fs";
import path from "node:path";

function mimeFor(file: string) {
  if (/\.png$/i.test(file)) return "image/png";
  if (/\.webp$/i.test(file)) return "image/webp";
  return "image/jpeg";
}

export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const raw = url.searchParams.get("file") || "";
        const file = path.basename(raw);
        if (!/^[a-zA-Z0-9._-]+\.(jpe?g|png|webp)$/i.test(file)) {
          return new Response("bad file", { status: 400 });
        }
        const { diskPhotoPath } = await import("@/lib/arwa/store");
        const abs = diskPhotoPath(file);
        if (!fs.existsSync(abs)) return new Response("missing", { status: 404 });
        const buf = fs.readFileSync(abs);
        return new Response(buf, {
          headers: {
            "content-type": mimeFor(file),
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
