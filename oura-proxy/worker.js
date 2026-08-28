// Cloudflare Worker: minimal CORS proxy for the oura heartrate tool.
// api.ouraring.com refuses browser (CORS) calls from any origin, so the
// site sends its requests here instead; this forwards them to oura and
// adds the CORS headers the browser needs. Deliberately a dumb pipe:
// GET only, usercollection paths only, forwards only the Authorization
// header, and answers only the origins listed below.

const ALLOWED_ORIGINS = new Set([
  "https://connorhopkins.xyz",
  "http://localhost:3000",
]);
const UPSTREAM = "https://api.ouraring.com";
const ALLOWED_PATH = /^\/v2\/(sandbox\/)?usercollection\//;

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "authorization");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") ?? "";
    if (!ALLOWED_ORIGINS.has(origin)) {
      return new Response("forbidden origin", { status: 403 });
    }
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), origin);
    }
    if (request.method !== "GET") {
      return withCors(new Response("method not allowed", { status: 405 }), origin);
    }

    const url = new URL(request.url);
    if (!ALLOWED_PATH.test(url.pathname)) {
      return withCors(new Response("path not allowed", { status: 403 }), origin);
    }

    const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
      headers: { Authorization: request.headers.get("Authorization") ?? "" },
    });
    return withCors(
      new Response(upstream.body, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
      }),
      origin
    );
  },
};
