/**
 * Utility functions for RISC-V ALE modules.
 */

/**
 * Converts a base64 encoded string to a Uint8Array byte buffer.
 * @param {string} base64 - Base64 encoded string
 * @returns {Uint8Array} Decoded binary bytes as a Uint8Array
 */
export function base64ToArrayBuffer(base64) {
  const atobFn =
    typeof window !== "undefined" && window.atob
      ? window.atob.bind(window)
      : globalThis.atob;
  const binaryString = atobFn(base64);
  const binaryLen = binaryString.length;
  const bytes = new Uint8Array(binaryLen);
  for (let i = 0; i < binaryLen; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
