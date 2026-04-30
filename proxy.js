import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
const port = process.env.PORT || 8000;

// Target site
const urlToProxy = process.env.PROXY_URL || "https://nyaa.si";

// Proxy handler
app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const targetUrl = new URL(urlToProxy + url.pathname + url.search);

  // Copy headers
  const headers = new Headers();
  c.req.raw.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "host") {
      headers.set(key, value);
    }
  });

  // Set correct host
  headers.set("host", new URL(urlToProxy).host);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: c.req.method,
      headers,
      body:
        c.req.method !== "GET" && c.req.method !== "HEAD"
          ? c.req.raw.body
          : undefined,
      redirect: "manual",
    });

    // Clean response headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (
        !["content-encoding", "content-length", "transfer-encoding"].includes(
          key.toLowerCase()
        )
      ) {
        responseHeaders.set(key, value);
      }
    });

    const contentType = response.headers.get("content-type") || "";

    // Build proxied base URL dynamically
    const proxiedHost = c.req.header("host");
    const proxiedUrl = `${url.protocol}//${proxiedHost}`;

    // 🔥 Handle text-based responses (HTML, JS, JSON, XML)
    if (
      contentType.includes("text") ||
      contentType.includes("json") ||
      contentType.includes("javascript") ||
      contentType.includes("xml")
    ) {
      let responseText = await response.text();

      // Replace original domain with proxy domain
      responseText = responseText
        .replaceAll("https://nyaa.si", proxiedUrl)
        .replaceAll("http://nyaa.si", proxiedUrl)
        .replaceAll("nyaa.si", proxiedHost);

      return new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    // 📦 Binary responses (images, torrents, etc.)
    const responseBody = await response.arrayBuffer();

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return c.json({ error: "Proxy request failed" }, 500);
  }
});

// Start server
serve({
  fetch: app.fetch,
  port: port,
});

console.log(`🚀 Hono proxy running at http://localhost:${port}`);
