import type { LatLon } from "@fentezfoamea/core";

const ALPHABET = "23456789CFGHJMPQRVWX";
const PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125];
const SEPARATOR_POSITION = 8;
const SHORT_OR_FULL = /(?<![23456789CFGHJMPQRVWX])([23456789CFGHJMPQRVWX]{2,8})\+([23456789CFGHJMPQRVWX]{2,3})?(?![23456789CFGHJMPQRVWX])/i;

export function plusCodeIn(text: string): string | undefined {
  const match = SHORT_OR_FULL.exec(text);
  return match ? `${match[1]}+${match[2] ?? ""}`.toUpperCase() : undefined;
}

export function decodePlusCode(code: string, reference: LatLon): LatLon | undefined {
  const [head = "", tail = ""] = code.toUpperCase().split("+");
  if (head.length % 2 !== 0 || head.length > SEPARATOR_POSITION) return undefined;
  const padding = SEPARATOR_POSITION - head.length;
  const full = encodePrefix(reference, padding) + head + tail.slice(0, 2);
  const area = decodeDigits(full);
  if (!area || padding === 0) return area;

  const resolution = PAIR_RESOLUTIONS[padding / 2 - 1]!;
  return { lat: nearest(area.lat, reference.lat, resolution), lon: nearest(area.lon, reference.lon, resolution) };
}

function nearest(value: number, reference: number, resolution: number): number {
  if (reference + resolution / 2 < value) return value - resolution;
  if (reference - resolution / 2 > value) return value + resolution;
  return value;
}

function encodePrefix({ lat, lon }: LatLon, length: number): string {
  let latRest = lat + 90;
  let lonRest = lon + 180;
  let code = "";
  for (const resolution of PAIR_RESOLUTIONS.slice(0, length / 2)) {
    const latDigit = Math.floor(latRest / resolution);
    const lonDigit = Math.floor(lonRest / resolution);
    latRest -= latDigit * resolution;
    lonRest -= lonDigit * resolution;
    code += ALPHABET[latDigit]! + ALPHABET[lonDigit]!;
  }
  return code;
}

function decodeDigits(digits: string): LatLon | undefined {
  let lat = 0;
  let lon = 0;
  let resolution = PAIR_RESOLUTIONS[0]!;
  for (let pair = 0; pair * 2 < digits.length; pair++) {
    resolution = PAIR_RESOLUTIONS[pair]!;
    const latDigit = ALPHABET.indexOf(digits[pair * 2]!);
    const lonDigit = ALPHABET.indexOf(digits[pair * 2 + 1] ?? "");
    if (latDigit < 0 || lonDigit < 0) return undefined;
    lat += latDigit * resolution;
    lon += lonDigit * resolution;
  }
  return { lat: lat + resolution / 2 - 90, lon: lon + resolution / 2 - 180 };
}
