// Serves a native bundle the way the app's own web view does: from the root of
// the origin, with an SPA fallback to index.html.
//
// Companion to check-phone-layout.mjs. Defaults to the iOS bundle; pass a
// directory to serve the Android one instead:
//
//   node scripts/serve-bundle.mjs android/app/src/main/assets/public
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
const ROOT = process.argv[2] ?? "ios/App/App/public";
const PORT = Number(process.env.PORT ?? 4176);
const T = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};
createServer(async (req, res) => {
  let rel = new URL(req.url, "http://x").pathname;
  if (rel.endsWith("/")) rel += "index.html";
  try {
    const b = await readFile(join(ROOT, rel));
    res.writeHead(200, { "content-type": T[extname(rel)] ?? "application/octet-stream" }).end(b);
  } catch {
    res
      .writeHead(200, { "content-type": "text/html" })
      .end(await readFile(join(ROOT, "index.html")));
  }
}).listen(PORT, () => console.log(`serving ${ROOT} on ${PORT}`));
