import { decodeSnapshot, type OfferSnapshot, type SnapshotWire } from "@/lib/offers";
import { SITE_URL } from "@/lib/site";
import { loadOfferSnapshot } from "./snapshot";

const REUSE_MS = 60_000;

let latest: { at: number; wire: Promise<SnapshotWire> } | undefined;
const decodedWires = new WeakMap<SnapshotWire, OfferSnapshot>();

export function sharedSnapshotWire(): Promise<SnapshotWire> {
  if (!latest || Date.now() - latest.at > REUSE_MS) {
    const entry = { at: Date.now(), wire: fromEdgeCache().catch(() => loadOfferSnapshot()) };
    latest = entry;
    entry.wire.catch(() => {
      if (latest === entry) latest = undefined;
    });
  }
  return latest.wire;
}

export async function sharedSnapshot(): Promise<OfferSnapshot> {
  const wire = await sharedSnapshotWire();
  let decoded = decodedWires.get(wire);
  if (!decoded) {
    decoded = decodeSnapshot(wire);
    decodedWires.set(wire, decoded);
  }
  return decoded;
}

async function fromEdgeCache(): Promise<SnapshotWire> {
  const origin = process.env.SNAPSHOT_ORIGIN ?? (process.env.VERCEL_ENV === "production" ? SITE_URL : undefined);
  if (!origin) return loadOfferSnapshot();
  const response = await fetch(`${origin}/api/snapshot`);
  if (!response.ok) throw new Error(`snapshot endpoint answered ${response.status}`);
  return (await response.json()) as SnapshotWire;
}
