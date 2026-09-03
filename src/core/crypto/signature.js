/**
 * Sign and verify data using ECDSA P-256 + SHA-256.
 */

const textEncoder = new TextEncoder();

export async function signData(privateKey, data) {
    if (!(privateKey instanceof CryptoKey)) {
        throw new TypeError("signData() requires a valid private CryptoKey.");
    }

    if (typeof data !== "string") {
        throw new TypeError("signData() expects a string.");
    }

    const encodedData = textEncoder.encode(data);

    const signature = await crypto.subtle.sign(
        {
            name: "ECDSA",
            hash: "SHA-256",
        },
        privateKey,
        encodedData
    );

    return new Uint8Array(signature);
}

export async function verifySignature(publicKey, data, signature) {
    if (!(publicKey instanceof CryptoKey)) {
        throw new TypeError(
            "verifySignature() requires a valid public CryptoKey."
        );
    }

    if (typeof data !== "string") {
        throw new TypeError("verifySignature() expects a string.");
    }

    const encodedData = textEncoder.encode(data);

    return crypto.subtle.verify(
        {
            name: "ECDSA",
            hash: "SHA-256",
        },
        publicKey,
        signature,
        encodedData
    );
}