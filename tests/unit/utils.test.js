import { describe, it, expect } from "vitest";
import { base64ToArrayBuffer } from "../../modules/utils.js";

describe("base64ToArrayBuffer", () => {
  it("converts empty base64 string to empty Uint8Array", () => {
    const result = base64ToArrayBuffer("");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });

  it("decodes ASCII base64 string correctly", () => {
    // "SGVsbG8gV29ybGQ=" is base64 for "Hello World"
    const result = base64ToArrayBuffer("SGVsbG8gV29ybGQ=");
    const text = new TextDecoder().decode(result);
    expect(text).toBe("Hello World");
  });

  it("decodes binary byte values correctly", () => {
    // Base64 for bytes [0x00, 0x01, 0xFE, 0xFF] is "AAH+/w=="
    const result = base64ToArrayBuffer("AAH+/w==");
    expect(Array.from(result)).toEqual([0x00, 0x01, 0xfe, 0xff]);
  });
});
