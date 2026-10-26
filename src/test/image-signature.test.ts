import { describe, it, expect } from "vitest";
import { detectImageType } from "../../server/src/services/imageSignature";

const bytes = (...values: number[]) => Buffer.from(values);
const ascii = (text: string) => Buffer.from(text, "latin1");

describe("detectImageType", () => {
  it("recognizes PNG only with the full signature and IHDR chunk", () => {
    const header = Buffer.concat([
      bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      bytes(0, 0, 0, 13),
      ascii("IHDR"),
    ]);
    expect(detectImageType(header)).toBe("image/png");
    expect(detectImageType(header.subarray(0, 8))).toBeNull();
    expect(detectImageType(Buffer.concat([header.subarray(0, 12), ascii("IDAT")]))).toBeNull();
  });

  it("recognizes JPEG by its SOI marker followed by a marker segment", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe("image/jpeg");
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xdb))).toBe("image/jpeg");
    expect(detectImageType(bytes(0xff, 0xd8, 0xff))).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0x00))).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8, 0x00, 0xe0))).toBeNull();
  });

  it("recognizes WebP only with a VP8, VP8L, or VP8X chunk", () => {
    for (const chunk of ["VP8 ", "VP8L", "VP8X"]) {
      const file = Buffer.concat([ascii("RIFF"), bytes(0x1a, 0, 0, 0), ascii("WEBP"), ascii(chunk)]);
      expect(detectImageType(file), chunk).toBe("image/webp");
    }
    const wave = Buffer.concat([ascii("RIFF"), bytes(0x1a, 0, 0, 0), ascii("WAVEfmt ")]);
    expect(detectImageType(wave)).toBeNull();
    const noChunk = Buffer.concat([ascii("RIFF"), bytes(0x1a, 0, 0, 0), ascii("WEBPJUNK")]);
    expect(detectImageType(noChunk)).toBeNull();
  });

  it("rejects other formats and empty input", () => {
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(ascii("GIF89a\x01\x00\x01\x00"))).toBeNull();
    expect(detectImageType(ascii("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageType(ascii("%PDF-1.7"))).toBeNull();
  });
});
