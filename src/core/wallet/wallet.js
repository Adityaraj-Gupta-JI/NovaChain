import { generateKeyPair } from "../crypto/keys.js";
import { sha256 } from "../crypto/hash.js";



/**
 * Export a public CryptoKey as a JWK object.
 */
async function exportPublicKey(publicKey) {
    return crypto.subtle.exportKey("jwk", publicKey);
}

/**
 * Create a deterministic NovaChain address
 * from a public key.
 *
 * Address = NVC + first 40 hexadecimal characters
 * of SHA-256(public-key-JWK)
 */
async function createAddress(publicKey) {
    const publicKeyJwk = await exportPublicKey(publicKey);
    const publicKeyData = JSON.stringify(publicKeyJwk);

    const publicKeyHash = await sha256(publicKeyData);

    return `NVC${publicKeyHash.slice(0, 40)}`;
}

/**
 * Generate a new NovaChain wallet.
 */
export async function createWallet() {
    const keyPair = await generateKeyPair();

    const address = await createAddress(keyPair.publicKey);

    return {
        address,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        createdAt: Date.now(),
    };
}