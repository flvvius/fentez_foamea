import { parse, unflatten } from "devalue";
import type { PoliteHttp } from "./http.ts";

type DataNode = { type: string; data?: unknown[] } | null;
type DataResponse = { type: string; nodes: DataNode[] };
type ActionResponse = { type: string; status: number; data?: string };

export async function fetchPageData(http: PoliteHttp, pageUrl: string): Promise<Record<string, unknown>> {
  const url = new URL(pageUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/__data.json`;
  const body = await http.json<DataResponse>(url.toString());
  return mergeNodes(body);
}

export function mergeNodes(body: DataResponse): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const node of body.nodes) {
    if (node?.type !== "data" || !node.data) continue;
    Object.assign(merged, unflatten(node.data) as Record<string, unknown>);
  }
  return merged;
}

export async function postAction(
  http: PoliteHttp,
  pageUrl: string,
  action: string,
  fields: Record<string, string>,
): Promise<Record<string, unknown>> {
  const origin = new URL(pageUrl).origin;
  const response = await http.json<ActionResponse>(`${pageUrl}?/${action}`, {
    method: "POST",
    body: new URLSearchParams(fields).toString(),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-sveltekit-action": "true",
      origin,
      referer: pageUrl,
    },
  });
  if (response.type !== "success" || !response.data) throw new Error(`SvelteKit action ${action} returned ${response.type}`);
  return parse(response.data) as Record<string, unknown>;
}

export function richText(blocks: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as { text?: unknown; children?: unknown[] };
    if (typeof record.text === "string") parts.push(record.text);
    for (const child of record.children ?? []) walk(child);
  };
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      walk(block);
      parts.push("\n");
    }
  }
  return parts
    .join("")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
