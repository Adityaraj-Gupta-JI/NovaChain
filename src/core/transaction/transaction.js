import { sha256 } from "../crypto/hash.js";
import { signData } from "../crypto/signature.js";

/**
 * Create the canonical representation of a transaction.
 *
 * This representation is what gets hashed and signed.
 */
function getTransactionPayload(transaction) {
    return JSON.stringify({
        version: transaction.version,
        inputs: transaction.inputs,
        outputs: transaction.outputs,
        timestamp: transaction.timestamp,
    });
}

/**
 * Create a new unsigned transaction.
 */
export function createTransaction({
    inputs = [],
    outputs = [],
}) {
    if (!Array.isArray(inputs)) {
        throw new TypeError("Transaction inputs must be an array.");
    }

    if (!Array.isArray(outputs)) {
        throw new TypeError("Transaction outputs must be an array.");
    }

    if (outputs.length === 0) {
        throw new Error("Transaction must contain at least one output.");
    }

    for (const output of outputs) {
        if (
            typeof output.address !== "string" ||
            output.address.length === 0
        ) {
            throw new Error("Transaction output requires a valid address.");
        }

        if (
            typeof output.amount !== "number" ||
            !Number.isSafeInteger(output.amount) ||
            output.amount <= 0
        ) {
            throw new Error(
                "Transaction output amount must be a positive safe integer."
            );
        }
    }

    return {
        version: 1,
        inputs,
        outputs,
        timestamp: Date.now(),
        id: null,
        signature: null,
    };
}

/**
 * Sign a transaction with the wallet's private key.
 */
export async function signTransaction(transaction, privateKey) {
    if (!(privateKey instanceof CryptoKey)) {
        throw new TypeError(
            "signTransaction() requires a valid private CryptoKey."
        );
    }

    const payload = getTransactionPayload(transaction);

    const signature = await signData(privateKey, payload);

    transaction.signature = Array.from(signature);

    transaction.id = await sha256(payload);

    return transaction;
}

/**
 * Return the canonical transaction payload.
 */
export function serializeTransaction(transaction) {
    return getTransactionPayload(transaction);
}