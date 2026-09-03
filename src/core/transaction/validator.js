import { verifySignature } from "../crypto/signature.js";
import { serializeTransaction } from "./transaction.js";

export async function verifyTransactionSignature(
    transaction
) {
    if (!transaction.inputs.length) {
        return false;
    }

    const payload = serializeTransaction(transaction);

    for (const input of transaction.inputs) {
        if (!input.publicKey || !input.signature) {
            return false;
        }

        const publicKey = await crypto.subtle.importKey(
            "jwk",
            input.publicKey,
            {
                name: "ECDSA",
                namedCurve: "P-256",
            },
            true,
            ["verify"]
        );

        const valid = await verifySignature(
            publicKey,
            payload,
            new Uint8Array(input.signature)
        );

        if (!valid) {
            return false;
        }
    }

    return true;
}