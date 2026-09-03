// ============================================================
// NOVACHAIN — TRANSACTION VALIDATOR
// File: src/core/transaction/validator.js
// ============================================================

import { verifySignature } from "../crypto/signature.js";
import {
    serializeTransaction,
} from "./transaction.js";

import {
    findUTXO,
    getUTXOKey,
    getTransactionInputValue,
    getTransactionOutputValue,
} from "./utxo.js";


/**
 * Verify the cryptographic signature attached
 * to a transaction input.
 *
 * @param {Object} transaction
 * @param {Object} input
 *
 * @returns {Promise<boolean>}
 */
async function verifyInputSignature(
    transaction,
    input
) {
    if (
        !input ||
        !input.publicKey ||
        !input.signature
    ) {
        return false;
    }

    try {
        /*
         * Import the public key supplied by
         * the transaction.
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
         * Reconstruct the exact transaction
         * payload that was originally signed.
         */
        const payload =
            serializeTransaction(
                transaction
            );

        /*
         * Verify the ECDSA signature.
         */
        return await verifySignature(
            publicKey,
            payload,
            new Uint8Array(
                input.signature
            )
        );
    } catch {
        return false;
    }
}


/**
 * Verify all transaction input signatures.
 *
 * @param {Object} transaction
 *
 * @returns {Promise<boolean>}
 */
export async function verifyTransactionSignature(
    transaction
) {
    if (
        !transaction ||
        transaction.type === "coinbase"
    ) {
        /*
         * Coinbase transactions are not signed.
         */
        return transaction?.type === "coinbase";
    }

    if (
        !Array.isArray(transaction.inputs) ||
        transaction.inputs.length === 0
    ) {
        return false;
    }

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


/**
 * Validate the basic structure of a transaction.
 *
 * @param {Object} transaction
 *
 * @returns {boolean}
 */
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
        transaction.id.length !== 64
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

    /*
     * Payment transactions require inputs.
     */
    if (
        transaction.type === "payment" &&
        transaction.inputs.length === 0
    ) {
        return false;
    }

    /*
     * Coinbase transactions must not have inputs.
     */
    if (
        transaction.type === "coinbase" &&
        transaction.inputs.length !== 0
    ) {
        return false;
    }

    return true;
}


/**
 * Validate that a transaction's referenced UTXOs
 * exist and are not duplicated.
 *
 * @param {Object} transaction
 * @param {Array} utxos
 *
 * @returns {boolean}
 */
export function validateTransactionInputs(
    transaction,
    utxos
) {
    if (
        !transaction ||
        !Array.isArray(transaction.inputs) ||
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
            typeof input.transactionId !==
                "string" ||
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
         * Prevent the same UTXO from being
         * referenced twice within one transaction.
         */
        if (
            usedInputs.has(key)
        ) {
            return false;
        }

        usedInputs.add(key);

        /*
         * The referenced UTXO must currently exist.
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


/**
 * Validate transaction value conservation.
 *
 * For a normal payment:
 *
 * input value >= output value
 *
 * The difference represents the transaction fee
 * in the current NovaChain model.
 *
 * @param {Object} transaction
 * @param {Array} utxos
 *
 * @returns {boolean}
 */
export function validateTransactionValues(
    transaction,
    utxos
) {
    try {
        /*
         * Coinbase transactions create new
         * currency and therefore do not use
         * normal input/output conservation.
         */
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

        return (
            inputValue >= outputValue
        );
    } catch {
        return false;
    }
}


/**
 * Complete transaction validation.
 *
 * This is the main validator entry point.
 *
 * Validation layers:
 *
 * 1. Structure
 * 2. Input references
 * 3. Value conservation
 * 4. Cryptographic signatures
 *
 * @param {Object} transaction
 * @param {Array} utxos
 *
 * @returns {Promise<boolean>}
 */
export async function validateTransaction(
    transaction,
    utxos
) {
    /*
     * --------------------------------------------------------
     * 1. Structural validation
     * --------------------------------------------------------
     */
    if (
        !validateTransactionStructure(
            transaction
        )
    ) {
        return false;
    }

    /*
     * --------------------------------------------------------
     * Coinbase validation
     * --------------------------------------------------------
     */
    if (
        transaction.type === "coinbase"
    ) {
        /*
         * Coinbase has no inputs and therefore
         * does not require signature validation.
         */
        return true;
    }

    /*
     * --------------------------------------------------------
     * 2. Validate referenced UTXOs
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * 3. Validate input/output value conservation
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * 4. Validate cryptographic signatures
     * --------------------------------------------------------
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