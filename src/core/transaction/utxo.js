// ============================================================
// NOVACHAIN — UTXO MODEL AND LEDGER UTILITIES
// File: src/core/transaction/utxo.js
// ============================================================

/**
 * Create a normalized Unspent Transaction Output.
 *
 * @param {Object} data
 * @param {string} data.transactionId
 * @param {number} data.outputIndex
 * @param {string} data.address
 * @param {number} data.amount
 *
 * @returns {Object}
 */
export function createUTXO({
    transactionId,
    outputIndex,
    address,
    amount,
}) {
    if (
        typeof transactionId !== "string" ||
        transactionId.length === 0
    ) {
        throw new Error(
            "UTXO requires a valid transaction ID."
        );
    }

    if (
        !Number.isInteger(outputIndex) ||
        outputIndex < 0
    ) {
        throw new Error(
            "UTXO requires a valid output index."
        );
    }

    if (
        typeof address !== "string" ||
        address.length === 0
    ) {
        throw new Error(
            "UTXO requires a valid address."
        );
    }

    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0
    ) {
        throw new Error(
            "UTXO amount must be a positive integer."
        );
    }

    return {
        transactionId,
        outputIndex,
        address,
        amount,
    };
}


/**
 * Create a stable identifier for a UTXO.
 *
 * A transaction output is uniquely identified by:
 *
 * transactionId + outputIndex
 *
 * @param {string} transactionId
 * @param {number} outputIndex
 *
 * @returns {string}
 */
export function getUTXOKey(
    transactionId,
    outputIndex
) {
    return `${transactionId}:${outputIndex}`;
}


/**
 * Get the stable key of an existing UTXO.
 *
 * @param {Object} utxo
 *
 * @returns {string}
 */
export function getUTXOKeyFromUTXO(
    utxo
) {
    if (!utxo) {
        throw new Error(
            "UTXO is required."
        );
    }

    return getUTXOKey(
        utxo.transactionId,
        utxo.outputIndex
    );
}


/**
 * Find a specific UTXO.
 *
 * @param {Array} utxos
 * @param {string} transactionId
 * @param {number} outputIndex
 *
 * @returns {Object|null}
 */
export function findUTXO(
    utxos,
    transactionId,
    outputIndex
) {
    if (!Array.isArray(utxos)) {
        throw new Error(
            "UTXO set must be an array."
        );
    }

    return (
        utxos.find(
            (utxo) =>
                utxo.transactionId === transactionId &&
                utxo.outputIndex === outputIndex
        ) || null
    );
}


/**
 * Check whether a UTXO exists.
 *
 * @param {Array} utxos
 * @param {string} transactionId
 * @param {number} outputIndex
 *
 * @returns {boolean}
 */
export function hasUTXO(
    utxos,
    transactionId,
    outputIndex
) {
    return (
        findUTXO(
            utxos,
            transactionId,
            outputIndex
        ) !== null
    );
}


/**
 * Get all UTXOs owned by an address.
 *
 * @param {Array} utxos
 * @param {string} address
 *
 * @returns {Array}
 */
export function getUTXOsForAddress(
    utxos,
    address
) {
    if (!Array.isArray(utxos)) {
        throw new Error(
            "UTXO set must be an array."
        );
    }

    return utxos.filter(
        (utxo) =>
            utxo.address === address
    );
}


/**
 * Calculate an address balance.
 *
 * @param {Array} utxos
 * @param {string} address
 *
 * @returns {number}
 */
export function getBalance(
    utxos,
    address
) {
    return getUTXOsForAddress(
        utxos,
        address
    ).reduce(
        (total, utxo) =>
            total + utxo.amount,
        0
    );
}


/**
 * Select enough UTXOs to cover a target amount.
 *
 * This currently uses a simple first-fit strategy.
 * Coin-selection optimization can be introduced later.
 *
 * @param {Array} utxos
 * @param {string} address
 * @param {number} amount
 *
 * @returns {{
 *     selected: Array,
 *     total: number,
 *     change: number
 * }}
 */
export function selectUTXOs(
    utxos,
    address,
    amount
) {
    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0
    ) {
        throw new Error(
            "Selection amount must be a positive integer."
        );
    }

    const available =
        getUTXOsForAddress(
            utxos,
            address
        );

    const selected = [];

    let total = 0;

    for (const utxo of available) {
        selected.push(utxo);

        total += utxo.amount;

        if (total >= amount) {
            break;
        }
    }

    if (total < amount) {
        throw new Error(
            "Insufficient funds."
        );
    }

    return {
        selected,
        total,
        change: total - amount,
    };
}


/**
 * Calculate the total value referenced by
 * transaction inputs.
 *
 * @param {Object} transaction
 * @param {Array} utxos
 *
 * @returns {number}
 */
export function getTransactionInputValue(
    transaction,
    utxos
) {
    if (
        !transaction ||
        !Array.isArray(transaction.inputs)
    ) {
        throw new Error(
            "Transaction inputs are required."
        );
    }

    let total = 0;

    const usedInputs = new Set();

    for (
        const input of transaction.inputs
    ) {
        const key = getUTXOKey(
            input.transactionId,
            input.outputIndex
        );

        if (usedInputs.has(key)) {
            throw new Error(
                "Duplicate transaction input detected."
            );
        }

        usedInputs.add(key);

        const utxo = findUTXO(
            utxos,
            input.transactionId,
            input.outputIndex
        );

        if (!utxo) {
            throw new Error(
                `Referenced UTXO does not exist: ${key}`
            );
        }

        total += utxo.amount;
    }

    return total;
}


/**
 * Calculate the total value produced by
 * transaction outputs.
 *
 * @param {Object} transaction
 *
 * @returns {number}
 */
export function getTransactionOutputValue(
    transaction
) {
    if (
        !transaction ||
        !Array.isArray(transaction.outputs)
    ) {
        throw new Error(
            "Transaction outputs are required."
        );
    }

    return transaction.outputs.reduce(
        (total, output) => {
            if (
                !Number.isSafeInteger(output.amount) ||
                output.amount <= 0
            ) {
                throw new Error(
                    "Transaction output amount is invalid."
                );
            }

            return (
                total +
                output.amount
            );
        },
        0
    );
}


/**
 * Validate transaction inputs against a UTXO set.
 *
 * Checks:
 *
 * - Input references exist.
 * - No input is duplicated.
 * - Referenced outputs have enough value.
 * - Output value does not exceed input value.
 *
 * @param {Object} transaction
 * @param {Array} utxos
 *
 * @returns {boolean}
 */
export function validateTransactionUTXOs(
    transaction,
    utxos
) {
    try {
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
 * Apply a transaction to a UTXO set.
 *
 * The operation:
 *
 * 1. Removes all spent inputs.
 * 2. Creates UTXOs for every output.
 *
 * Returns a NEW UTXO array rather than
 * mutating the original state.
 *
 * @param {Array} utxos
 * @param {Object} transaction
 *
 * @returns {Array}
 */
export function applyTransactionToUTXOSet(
    utxos,
    transaction
) {
    if (!Array.isArray(utxos)) {
        throw new Error(
            "UTXO set must be an array."
        );
    }

    if (
        !transaction ||
        typeof transaction !== "object"
    ) {
        throw new Error(
            "A valid transaction is required."
        );
    }

    if (
        !Array.isArray(transaction.outputs)
    ) {
        throw new Error(
            "Transaction outputs are required."
        );
    }

    const isCoinbase =
        transaction.type === "coinbase";

    let nextUTXOs =
        [...utxos];

    /*
     * Standard transactions consume
     * existing UTXOs.
     */
    if (!isCoinbase) {
        if (
            !Array.isArray(transaction.inputs) ||
            transaction.inputs.length === 0
        ) {
            throw new Error(
                "Standard transaction requires inputs."
            );
        }

        if (
            !validateTransactionUTXOs(
                transaction,
                utxos
            )
        ) {
            throw new Error(
                "Transaction references invalid UTXOs."
            );
        }

        const spentKeys =
            new Set(
                transaction.inputs.map(
                    (input) =>
                        getUTXOKey(
                            input.transactionId,
                            input.outputIndex
                        )
                )
            );

        nextUTXOs =
            nextUTXOs.filter(
                (utxo) =>
                    !spentKeys.has(
                        getUTXOKeyFromUTXO(
                            utxo
                        )
                    )
            );
    }

    /*
     * Every transaction output becomes
     * a new UTXO.
     */
    const newUTXOs =
        transaction.outputs.map(
            (output, outputIndex) =>
                createUTXO({
                    transactionId:
                        transaction.id,

                    outputIndex,

                    address:
                        output.address,

                    amount:
                        output.amount,
                })
        );

    return [
        ...nextUTXOs,
        ...newUTXOs,
    ];
}


/**
 * Apply multiple transactions to a UTXO set.
 *
 * Each transaction operates on the state
 * produced by the previous transaction.
 *
 * @param {Array} utxos
 * @param {Array} transactions
 *
 * @returns {Array}
 */
export function applyTransactionsToUTXOSet(
    utxos,
    transactions
) {
    if (!Array.isArray(transactions)) {
        throw new Error(
            "Transactions must be an array."
        );
    }

    let nextUTXOs =
        [...utxos];

    for (
        const transaction of transactions
    ) {
        nextUTXOs =
            applyTransactionToUTXOSet(
                nextUTXOs,
                transaction
            );
    }

    return nextUTXOs;
}