import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultRequest, safeFetch, type LookupFn, type RequestFn } from "./safe-fetch.ts";

// These tests drive the real undici request path against a loopback server. The SSRF policy is
// bypassed only here, by calling the low-level request function directly with a pinned
// 127.0.0.1; safeFetch's own validation is satisfied with a fake public DNS answer and a request
// wrapper that points the (validated) public URL at the loopback port. No external network or DNS.

let server: Server;
let port: number;
let handler: (req: IncomingMessage, res: ServerResponse) => void = (_req, res) => res.end();
const seenHosts: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    seenHosts.push(String(req.headers.host));
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];

const viaLoopback: RequestFn = (input) => {
  const url = new URL(input.url.href);
  url.protocol = "http:";
  url.port = String(port);
  return defaultRequest({ ...input, url, address: "127.0.0.1", family: 4 });
};

async function read(body: AsyncIterable<Uint8Array>): Promise<string> {
  let out = "";
  for await (const chunk of body) out += Buffer.from(chunk).toString("utf-8");
  return out;
}

describe("defaultRequest against a loopback server", () => {
  it("follows a 301 to a 200 without any unhandled error", async () => {
    const errors: unknown[] = [];
    const onError = (error: unknown) => errors.push(error);
    process.on("uncaughtException", onError);
    process.on("unhandledRejection", onError);
    try {
      let hit = 0;
      handler = (_req, res) => {
        if (hit++ === 0) {
          res.writeHead(301, { location: "https://example.com/final", "content-type": "text/html", "content-length": "0" });
          res.end();
        } else {
          res.writeHead(200, { "content-type": "text/plain" });
          res.end("ok");
        }
      };
      const res = await safeFetch("http://example.com/", {}, { lookup: publicLookup, request: viaLoopback });
      expect(res.url).toBe("https://example.com/final");
      expect(res.body.toString()).toBe("ok");
      // The destroyed redirect body used to emit its error a tick later and kill the process.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(errors).toEqual([]);
    } finally {
      process.off("uncaughtException", onError);
      process.off("unhandledRejection", onError);
    }
  });

  it("sends the original hostname as Host while connecting to the pinned address", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hi");
    };
    seenHosts.length = 0;
    const result = await defaultRequest({
      url: new URL(`http://pinned-test.invalid:${port}/x`),
      address: "127.0.0.1",
      family: 4,
      headers: { accept: "*/*" },
      signal: AbortSignal.timeout(3000),
      maxBytes: 1000,
    });
    expect(await read(result.body)).toBe("hi");
    result.close?.();
    expect(seenHosts).toEqual([`pinned-test.invalid:${port}`]);
  });

  it("decompresses gzip bodies within the limit", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
      res.end(gzipSync("compressed hello"));
    };
    const res = await safeFetch("http://example.com/", {}, { lookup: publicLookup, request: viaLoopback });
    expect(res.body.toString()).toBe("compressed hello");
  });

  it("rejects a gzip bomb as too_large even though the wire size is tiny", async () => {
    const bomb = gzipSync(Buffer.alloc(5_000_000, 0x61));
    expect(bomb.length).toBeLessThan(10_000);
    handler = (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
      res.end(bomb);
    };
    await expect(safeFetch("http://example.com/", { maxBytes: 10_000 }, { lookup: publicLookup, request: viaLoopback })).rejects.toMatchObject({
      code: "too_large",
    });
  });

  it("closes the connection when the body is abandoned early", async () => {
    let closed: Promise<void> | undefined;
    handler = (req, res) => {
      closed = new Promise((resolve) => req.socket.once("close", () => resolve()));
      res.writeHead(200, { "content-type": "text/plain" });
      const timer = setInterval(() => res.write(Buffer.alloc(8192, 0x61)), 1);
      res.on("close", () => clearInterval(timer));
    };
    await expect(safeFetch("http://example.com/", { maxBytes: 20_000 }, { lookup: publicLookup, request: viaLoopback })).rejects.toMatchObject({
      code: "too_large",
    });
    await expect(Promise.race([closed, new Promise((_r, reject) => setTimeout(() => reject(new Error("socket still open")), 2000))])).resolves.toBeUndefined();
  });

  it("closes the connection of an unread redirect body", async () => {
    const sockets: Promise<void>[] = [];
    let hit = 0;
    handler = (req, res) => {
      sockets.push(new Promise((resolve) => req.socket.once("close", () => resolve())));
      if (hit++ === 0) {
        res.writeHead(302, { location: "/next", "content-type": "text/html" });
        res.write("<p>moved</p>"); // chunked, never ended: the client must not wait for it
      } else {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("done");
      }
    };
    const res = await safeFetch("http://example.com/", {}, { lookup: publicLookup, request: viaLoopback });
    expect(res.body.toString()).toBe("done");
    await expect(Promise.race([sockets[0], new Promise((_r, reject) => setTimeout(() => reject(new Error("socket still open")), 2000))])).resolves.toBeUndefined();
  });
});
