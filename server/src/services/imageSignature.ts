export type SupportedImageType = "image/png" | "image/jpeg" | "image/webp";

export const IMAGE_EXTENSIONS: Record<SupportedImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function asciiAt(buffer: Buffer, offset: number, text: string): boolean {
  return (
    buffer.length >= offset + text.length &&
    buffer.toString("latin1", offset, offset + text.length) === text
  );
}

/**
 * Identifies a PNG, JPEG, or WebP image from its leading bytes instead of the
 * client-supplied MIME type. Returns null for anything else, including
 * truncated files that only carry part of a signature.
 */
export function detectImageType(buffer: Buffer): SupportedImageType | null {
  // PNG: 8-byte signature followed by the IHDR chunk (length + "IHDR").
  if (
    buffer.length >= 16 &&
    buffer.subarray(0, 8).equals(PNG_SIGNATURE) &&
    asciiAt(buffer, 12, "IHDR")
  ) {
    return "image/png";
  }

  // JPEG: SOI marker (FF D8) followed by another marker segment (FF xx).
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer[3] !== 0x00 &&
    buffer[3] !== 0xff
  ) {
    return "image/jpeg";
  }

  // WebP: RIFF container with WEBP form type and a VP8/VP8L/VP8X chunk.
  if (
    buffer.length >= 16 &&
    asciiAt(buffer, 0, "RIFF") &&
    asciiAt(buffer, 8, "WEBP") &&
    (asciiAt(buffer, 12, "VP8 ") || asciiAt(buffer, 12, "VP8L") || asciiAt(buffer, 12, "VP8X"))
  ) {
    return "image/webp";
  }

  return null;
}
