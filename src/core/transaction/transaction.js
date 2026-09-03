// ============================================================
// NOVACHAIN — TRANSACTION MODEL
// File: src/core/transaction/transaction.js
// ============================================================

import { sha256 } from "../crypto/hash.js";
import { signData } from "../crypto/signature.js";


// ============================================================
// CANONICAL TRANSACTION SERIALIZATION
// ============================================================

/**
 * Create the canonical representation of a transaction.
 *
 * Cryptographic signatures are intentionally excluded from
 * this representation.
 *
 * This guarantees that signing and verification operate on
 * exactly the same byte sequence.
 */
export function serializeTransaction(transaction) {
    if (!transaction || typeof transaction !== "object") {
        throw new TypeError(
            "A valid transaction is required."
        );
    }

    return JSON.stringify({
        type: transaction.type ?? "payment",
        version: transaction.version,
        inputs: Array.isArray(transaction.inputs)
            ? transaction.inputs.map((input) => ({
                transactionId:
                    input.transactionId,

                outputIndex:
                    input.outputIndex,
            }))
            : [],

        outputs: Array.isArray(transaction.outputs)
            ? transaction.outputs.map((output) => ({
                address:
                    output.address,

                amount:
                    output.amount,
            }))
            : [],

        timestamp:
            transaction.timestamp,
    });
}


// ============================================================
// TRANSACTION CREATION
// ============================================================

export function createTransaction({
    inputs = [],
    outputs = [],
}) {
    if (!Array.isArray(inputs)) {
        throw new TypeError(
            "Transaction inputs must be an array."
        );
    }

    if (
        !Array.isArray(outputs) ||
        outputs.length === 0
    ) {
        throw new Error(
            "Transaction must contain at least one output."
        );
    }

    for (const input of inputs) {
        if (
            !input ||
            typeof input.transactionId !== "string" ||
            input.transactionId.length === 0
        ) {
            throw new Error(
                "Transaction input requires a transaction ID."
            );
        }

        if (
            !Number.isInteger(input.outputIndex) ||
            input.outputIndex < 0
        ) {
            throw new Error(
                "Transaction input requires a valid output index."
            );
        }
    }

    for (const output of outputs) {
        if (
            !output ||
            typeof output.address !== "string" ||
            output.address.length === 0
        ) {
            throw new Error(
                "Transaction output requires a valid address."
            );
        }

        if (
            !Number.isSafeInteger(output.amount) ||
            output.amount <= 0
        ) {
            throw new Error(
                "Transaction output amount must be a positive safe integer."
            );
        }
    }

    return {
        type: "payment",

        version: 1,

        inputs: inputs.map((input) => ({
            transactionId:
                input.transactionId,

            outputIndex:
                input.outputIndex,
        })),

        outputs: outputs.map((output) => ({
            address:
                output.address,

            amount:
                output.amount,
        })),

        timestamp:
            Date.now(),

        id: null,
    };
}


// ============================================================
// TRANSACTION SIGNING
// ============================================================

export async function signTransaction(
    transaction,
    privateKey,
    publicKey
) {
    if (!transaction || typeof transaction !== "object") {
        throw new TypeError(
            "A valid transaction is required."
        );
    }

    if (transaction.type !== "payment") {
        throw new Error(
            "Only payment transactions can be signed."
        );
    }

    if (
        !Array.isArray(transaction.inputs) ||
        transaction.inputs.length === 0
    ) {
        throw new Error(
            "Payment transaction must contain inputs."
        );
    }

    if (!(privateKey instanceof CryptoKey)) {
        throw new TypeError(
            "A valid private CryptoKey is required."
        );
    }

    if (!(publicKey instanceof CryptoKey)) {
        throw new TypeError(
            "A valid public CryptoKey is required."
        );
    }

    /*
     * Remove any previous signature material before
     * generating the canonical signing payload.
     *
     * The serializer already excludes signature fields,
     * but this keeps the transaction protocol explicit.
     */
    const signingPayload =
        serializeTransaction(transaction);

    /*
     * Generate ECDSA signature.
     */
    const signature =
        await signData(
            privateKey,
            signingPayload
        );

    /*
     * Export the public key so the receiving node can
     * independently verify the signature.
     */
    const publicKeyJwk =
        await crypto.subtle.exportKey(
            "jwk",
            publicKey
        );

    /*
     * Store the same public key and signature on each
     * input for the MVP's single-owner UTXO model.
     */
    transaction.inputs =
        transaction.inputs.map(
            (input) => ({
                ...input,

                publicKey:
                    publicKeyJwk,

                signature:
                    Array.from(signature),
            })
        );

    /*
     * Transaction ID is derived from the canonical
     * transaction body, excluding signatures.
     *
     * This makes the transaction ID deterministic for
     * the transaction's actual economic contents.
     */
    transaction.id =
        await sha256(
            serializeTransaction(
                transaction
            )
        );

    return transaction;
}


// ============================================================
// COINBASE TRANSACTION
// ============================================================

export function createCoinbaseTransaction({
    minerAddress,
    reward,
}) {
    if (
        typeof minerAddress !== "string" ||
        minerAddress.length === 0
    ) {
        throw new Error(
            "A valid miner address is required."
        );
    }

    if (
        !Number.isSafeInteger(reward) ||
        reward <= 0
    ) {
        throw new Error(
            "Coinbase reward must be a positive safe integer."
        );
    }

    return {
        type: "coinbase",

        version: 1,

        inputs: [],

        outputs: [
            {
                address:
                    minerAddress,

                amount:
                    reward,
            },
        ],

        timestamp:
            Date.now(),

        id: null,
    };
}


// ============================================================
// FINALIZE COINBASE
// ============================================================

export async function finalizeCoinbaseTransaction(
    transaction
) {
    if (
        !transaction ||
        transaction.type !== "coinbase"
    ) {
        throw new Error(
            "A valid coinbase transaction is required."
        );
    }

    if (
        !Array.isArray(transaction.inputs) ||
        transaction.inputs.length !== 0
    ) {
        throw new Error(
            "Coinbase transaction cannot contain inputs."
        );
    }

    if (
        !Array.isArray(transaction.outputs) ||
        transaction.outputs.length !== 1
    ) {
        throw new Error(
            "Coinbase transaction must contain exactly one output."
        );
    }

    const output =
        transaction.outputs[0];

    if (
        !output ||
        typeof output.address !== "string" ||
        output.address.length === 0
    ) {
        throw new Error(
            "Coinbase output requires a valid address."
        );
    }

    if (
        !Number.isSafeInteger(output.amount) ||
        output.amount <= 0
    ) {
        throw new Error(
            "Coinbase reward must be a positive safe integer."
        );
    }

    transaction.id =
        await sha256(
            serializeTransaction(
                transaction
            )
        );

    return transaction;
}