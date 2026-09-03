const textEncoder = new TextEncoder();

/**
 * Convert an ArrayBuffer into a hexadecimal string.
 */
function bufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);

    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Calculate the SHA-256 hash of a UTF-8 string.
 *
 * Uses the browser's native Web Crypto API.
 *
 * @param {string} data
 * @returns {Promise<string>} 64-character hexadecimal SHA-256 digest
 */
export async function sha256(data) {
    if (typeof data !== "string") {
        throw new TypeError("sha256() expects a string.");
    }

    const encodedData = textEncoder.encode(data);

    const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        encodedData
    );

    return bufferToHex(hashBuffer);
}