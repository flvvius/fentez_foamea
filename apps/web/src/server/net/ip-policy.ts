import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

// Allow-list first: an address passes only if ipaddr.js classifies it as plain "unicast"
// (and, for IPv6, it sits in the global-unicast block 2000::/3). The explicit deny CIDRs below
// are belt and braces for ranges whose classification differs between ipaddr.js versions, so a
// library update can't silently open a hole. Anything unparsable is rejected.

const IPV4_DENY = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "255.255.255.255/32",
].map((cidr) => ipaddr.IPv4.parseCIDR(cidr));

const IPV6_DENY = [
  "::/128",
  "::1/128",
  "64:ff9b::/96", // NAT64: would reach whatever IPv4 host the gateway maps to
  "100::/64", // discard-only
  "2001::/23", // IETF protocol assignments, includes Teredo 2001::/32
  "2001:db8::/32",
  "2002::/16", // 6to4
  "3fff::/20", // documentation
  "5f00::/16", // SRv6 SIDs
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
].map((cidr) => ipaddr.IPv6.parseCIDR(cidr));

const IPV6_GLOBAL_UNICAST = ipaddr.IPv6.parseCIDR("2000::/3");

function isPublicIPv4(addr: ipaddr.IPv4): boolean {
  if (addr.range() !== "unicast") return false;
  return !IPV4_DENY.some((cidr) => addr.match(cidr));
}

export function isPublicAddress(ip: string): boolean {
  // Zone ids are only meaningful for link-local addresses, and net.isIP insists on canonical
  // forms, so legacy shorthand like "127.1" or "0x7f.1" never reaches ipaddr's lenient parser.
  if (typeof ip !== "string" || ip.includes("%") || isIP(ip) === 0) return false;

  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return false;
  }

  if (addr.kind() === "ipv4") return isPublicIPv4(addr as ipaddr.IPv4);

  // ipaddr.js reads "::a.b.c.d" as IPv4-mapped, but inet_pton (and so the kernel) reads it as
  // IPv4-compatible. Never trust a dotted tail unless the prefix is unambiguously ::ffff:.
  if (ip.includes(".") && !/^(?:::|(?:0{1,4}:){5})ffff:/i.test(ip)) return false;

  const v6 = addr as ipaddr.IPv6;
  const p = v6.parts;
  const topFiveZero = p.slice(0, 5).every((x) => x === 0);
  if (topFiveZero && p[5] === 0xffff) {
    // IPv4-mapped: the kernel treats it as the embedded IPv4 address, so judge that instead.
    return isPublicIPv4(ipaddr.IPv4.parse(`${p[6]! >> 8}.${p[6]! & 255}.${p[7]! >> 8}.${p[7]! & 255}`));
  }
  if (topFiveZero && p[5] === 0) return false; // ::/96, includes IPv4-compatible ::a.b.c.d

  if (!v6.match(IPV6_GLOBAL_UNICAST)) return false;
  if (v6.range() !== "unicast") return false;
  return !IPV6_DENY.some((cidr) => v6.match(cidr));
}
