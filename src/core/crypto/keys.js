/**
 * Generate an ECDSA public/private key pair.
 *
 * NovaChain uses P-256 with SHA-256 for its MVP cryptographic layer.
 *
 * The private key is intended to remain local to the node.
 * The public key can later be included with transactions
 * so peers can verify signatures.
 */

export async function generateKeyPair() {
    return crypto.subtle.generateKey(
        {
            name: "ECDSA",
            namedCurve: "P-256",
        },
        true,
        ["sign", "verify"]
    );
}