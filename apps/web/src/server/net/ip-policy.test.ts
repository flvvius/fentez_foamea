import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./ip-policy.ts";

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700::1111", "2a00:1450:4001:81b::200e"])(
    "accepts public %s",
    (ip) => expect(isPublicAddress(ip)).toBe(true),
  );

  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "169.254.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "239.255.255.250",
    "240.0.0.1",
    "255.255.255.255",
  ])("rejects IPv4 %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "198.17.255.255", "198.20.0.1", "169.253.1.1"])(
    "accepts neighbours of reserved IPv4 ranges: %s",
    (ip) => expect(isPublicAddress(ip)).toBe(true),
  );

  it.each([
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "febf::1",
    "ff02::1",
    "2001:db8::1",
    "64:ff9b::808:808",
    "2002:7f00:1::1",
    "2001::1",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "3fff::1",
    "100::1",
  ])("rejects IPv6 %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it("checks the embedded IPv4 of IPv4-mapped addresses", () => {
    expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:7f00:1")).toBe(false);
    expect(isPublicAddress("::ffff:169.254.169.254")).toBe(false);
    expect(isPublicAddress("::ffff:10.0.0.1")).toBe(false);
    expect(isPublicAddress("0:0:0:0:0:ffff:a9fe:a9fe")).toBe(false);
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
    expect(isPublicAddress("::ffff:808:808")).toBe(true);
  });

  it("rejects IPv4-compatible addresses", () => {
    expect(isPublicAddress("::127.0.0.1")).toBe(false);
    expect(isPublicAddress("::8.8.8.8")).toBe(false);
    expect(isPublicAddress("::808:808")).toBe(false);
  });

  it.each(["", "[::]", "[::1]", "fe80::1%lo0", "2606:4700::1111%eth0", "localhost", "example.com", "999.1.1.1", "1.2.3", "127.1", "0x7f.1", "2130706433", "0177.0.0.1", "8.8.8.8/32", " 8.8.8.8", "8.8.8.8 "])(
    "rejects unparsable or non-canonical input %j",
    (ip) => expect(isPublicAddress(ip)).toBe(false),
  );
});
