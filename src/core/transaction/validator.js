// ============================================================
// NOVACHAIN — TRANSACTION VALIDATOR
// File: src/core/transaction/validator.js
// ============================================================

import { sha256 } from "../crypto/hash.js";

import {
    verifySignature,
} from "../crypto/signature.js";

import {
    serializeTransaction,
} from "./transaction.js";

import {
    findUTXO,
    getUTXOKey,
    getTransactionInputValue,
    getTransactionOutputValue,
} from "./utxo.js";


// ============================================================
// PUBLIC KEY → NOVACHAIN ADDRESS
// ============================================================

async function deriveAddressFromPublicKey(
    publicKeyJwk
) {
    if (
        !publicKeyJwk ||
        typeof publicKeyJwk !== "object"
    ) {
        throw new Error(
            "Public key JWK is required."
        );
    }

    const publicKeyData =
        JSON.stringify(
            publicKeyJwk
        );

    const publicKeyHash =
        await sha256(
            publicKeyData
        );

    return `NVC${publicKeyHash.slice(0, 40)}`;
}


// ============================================================
// INPUT SIGNATURE VERIFICATION
// ============================================================

async function verifyInputSignature(
    transaction,
    input
) {
    if (
        !input ||
        !input.publicKey ||
        !Array.isArray(input.signature)
    ) {
        return false;
    }

    try {
        /*
         * Import the sender's public key.
         */
        const publicKey =
            await crypto.subtle.importKey(
                "jwk",

                input.publicKey,

                {
                    name: "ECDSA",
                    namedCurve: "P-256",
                },

                true,

                ["verify"]
            );

        /*
         * Recreate exactly the canonical payload
         * that was signed by the sender.
         */
        const payload =
            serializeTransaction(
                transaction
            );

        /*
         * Verify the ECDSA signature.
         */
        const signatureValid =
            await verifySignature(
                publicKey,
                payload,
                new Uint8Array(
                    input.signature
                )
            );

        if (!signatureValid) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}


// ============================================================
// TRANSACTION SIGNATURE VALIDATION
// ============================================================

export async function verifyTransactionSignature(
    transaction
) {
    /*
     * Coinbase transactions are not signed by a wallet.
     */
    if (
        transaction?.type === "coinbase"
    ) {
        return true;
    }

    if (
        !transaction ||
        transaction.type !== "payment"
    ) {
        return false;
    }

    if (
        !Array.isArray(transaction.inputs) ||
        transaction.inputs.length === 0
    ) {
        return false;
    }

    /*
     * Every input must carry a valid signature.
     *
     * NovaChain MVP currently uses a single wallet
     * key for all selected UTXOs in one payment.
     */
    for (
        const input of transaction.inputs
    ) {
        const valid =
            await verifyInputSignature(
                transaction,
                input
            );

        if (!valid) {
            return false;
        }
    }

    return true;
}


// ============================================================
// TRANSACTION STRUCTURE
// ============================================================

export function validateTransactionStructure(
    transaction
) {
    if (
        !transaction ||
        typeof transaction !== "object"
    ) {
        return false;
    }

    if (
        transaction.type !== "payment" &&
        transaction.type !== "coinbase"
    ) {
        return false;
    }

    if (
        transaction.version !== 1
    ) {
        return false;
    }

    if (
        !Number.isSafeInteger(
            transaction.timestamp
        ) ||
        transaction.timestamp <= 0
    ) {
        return false;
    }

    if (
        typeof transaction.id !== "string" ||
        !/^[0-9a-f]{64}$/.test(
            transaction.id
        )
    ) {
        return false;
    }

    if (
        !Array.isArray(
            transaction.inputs
        )
    ) {
        return false;
    }

    if (
        !Array.isArray(
            transaction.outputs
        ) ||
        transaction.outputs.length === 0
    ) {
        return false;
    }

    for (
        const output of transaction.outputs
    ) {
        if (
            !output ||
            typeof output.address !== "string" ||
            output.address.length === 0
        ) {
            return false;
        }

        if (
            !Number.isSafeInteger(
                output.amount
            ) ||
            output.amount <= 0
        ) {
            return false;
        }
    }

    if (
        transaction.type === "payment" &&
        transaction.inputs.length === 0
    ) {
        return false;
    }

    if (
        transaction.type === "coinbase" &&
        transaction.inputs.length !== 0
    ) {
        return false;
    }

    return true;
}


// ============================================================
// TRANSACTION INPUT VALIDATION
// ============================================================

export function validateTransactionInputs(
    transaction,
    utxos
) {
    if (
        !transaction ||
        !Array.isArray(
            transaction.inputs
        ) ||
        !Array.isArray(utxos)
    ) {
        return false;
    }

    const usedInputs =
        new Set();

    for (
        const input of transaction.inputs
    ) {
        if (
            !input ||
            typeof input.transactionId !== "string" ||
            !/^[0-9a-f]{64}$/.test(
                input.transactionId
            ) ||
            !Number.isInteger(
                input.outputIndex
            ) ||
            input.outputIndex < 0
        ) {
            return false;
        }

        const key =
            getUTXOKey(
                input.transactionId,
                input.outputIndex
            );

        /*
         * Double-spending the same UTXO inside
         * one transaction is invalid.
         */
        if (
            usedInputs.has(key)
        ) {
            return false;
        }

        usedInputs.add(key);

        /*
         * Referenced UTXO must exist.
         */
        const utxo =
            findUTXO(
                utxos,
                input.transactionId,
                input.outputIndex
            );

        if (!utxo) {
            return false;
        }
    }

    return true;
}


// ============================================================
// TRANSACTION VALUE VALIDATION
// ============================================================

export function validateTransactionValues(
    transaction,
    utxos
) {
    try {
        if (
            transaction.type === "coinbase"
        ) {
            return true;
        }

        const inputValue =
            getTransactionInputValue(
                transaction,
                utxos
            );

        const outputValue =
            getTransactionOutputValue(
                transaction
            );

        /*
         * A transaction cannot create value.
         */
        return (
            inputValue >= outputValue
        );
    } catch {
        return false;
    }
}


// ============================================================
// INPUT OWNERSHIP VALIDATION
// ============================================================

export async function validateTransactionOwnership(
    transaction,
    utxos
) {
    if (
        transaction.type === "coinbase"
    ) {
        return true;
    }

    try {
        for (
            const input of transaction.inputs
        ) {
            const utxo =
                findUTXO(
                    utxos,
                    input.transactionId,
                    input.outputIndex
                );

            if (!utxo) {
                return false;
            }

            /*
             * The public key supplied with the input
             * must derive to the address that owns
             * the referenced UTXO.
             */
            const derivedAddress =
                await deriveAddressFromPublicKey(
                    input.publicKey
                );

            if (
                derivedAddress !==
                utxo.address
            ) {
                return false;
            }
        }

        return true;
    } catch {
        return false;
    }
}


// ============================================================
// COMPLETE TRANSACTION VALIDATION
// ============================================================

export async function validateTransaction(
    transaction,
    utxos
) {
    /*
     * 1. Basic structure.
     */
    if (
        !validateTransactionStructure(
            transaction
        )
    ) {
        return false;
    }

    /*
     * 2. Coinbase transactions do not require
     * wallet signatures.
     */
    if (
        transaction.type === "coinbase"
    ) {
        return true;
    }

    /*
     * 3. Inputs must reference existing,
     * non-duplicated UTXOs.
     */
    if (
        !validateTransactionInputs(
            transaction,
            utxos
        )
    ) {
        return false;
    }

    /*
     * 4. Sender cannot spend more than
     * the value contained in referenced UTXOs.
     */
    if (
        !validateTransactionValues(
            transaction,
            utxos
        )
    ) {
        return false;
    }

    /*
     * 5. Public key must actually own the
     * referenced UTXO.
     */
    if (
        !(await validateTransactionOwnership(
            transaction,
            utxos
        ))
    ) {
        return false;
    }

    /*
     * 6. Finally verify the cryptographic
     * signature over the canonical payload.
     */
    if (
        !(await verifyTransactionSignature(
            transaction
        ))
    ) {
        return false;
    }

    return true;
}