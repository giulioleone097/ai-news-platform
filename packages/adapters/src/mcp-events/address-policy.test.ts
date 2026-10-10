import { describe, expect, it } from "vitest";

import { isPublicAddress } from "./address-policy";

describe("address policy", () => {
  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "1.1.1.1",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "198.17.0.1",
    "2606:4700:4700::1111",
    "2a00:1450:4001:81b::200e",
    "::ffff:8.8.8.8",
    "2002:0808:0808::1",
  ])("allows public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.0.2.10",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "239.255.255.250",
    "240.0.0.1",
    "255.255.255.255",
  ])("blocks non-public IPv4 %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:10.1.2.3",
    "::ffff:169.254.169.254",
    "::ffff:7f00:1",
    "::127.0.0.1",
    "64:ff9b::7f00:1",
    "64:ff9b:1::1",
    "100::1",
    "2001::1",
    "2001:db8::1",
    "2002:7f00:1::1",
    "2002:a9fe:a9fe::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%eth0",
    "fec0::1",
    "ff02::1",
    "3fff::1",
    "5f00::1",
  ])("blocks non-public IPv6 %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it("rejects things that are not IP literals", () => {
    expect(isPublicAddress("example.com")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
    expect(isPublicAddress("999.1.1.1")).toBe(false);
  });
});
