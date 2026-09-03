/**
 * UTXO utilities for NovaChain.
 *
 * A UTXO represents an unspent transaction output.
 */

export function createUTXO({
    transactionId,
    outputIndex,
    address,
    amount,
}) {
    if (typeof transactionId !== "string" || !transactionId) {
        throw new Error("UTXO requires a transaction ID.");
    }

    if (!Number.isInteger(outputIndex) || outputIndex < 0) {
        throw new Error("UTXO requires a valid output index.");
    }

    if (typeof address !== "string" || !address) {
        throw new Error("UTXO requires an address.");
    }

    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new Error("UTXO amount must be a positive safe integer.");
    }

    return {
        transactionId,
        outputIndex,
        address,
        amount,
    };
}

export function getUTXOKey(transactionId, outputIndex) {
    return `${transactionId}:${outputIndex}`;
}

export function getBalance(utxos, address) {
    return utxos
        .filter((utxo) => utxo.address === address)
        .reduce((total, utxo) => total + utxo.amount, 0);
}

export function selectUTXOs(utxos, address, requiredAmount) {
    if (!Number.isSafeInteger(requiredAmount) || requiredAmount <= 0) {
        throw new Error("Required amount must be a positive integer.");
    }

    const ownedUTXOs = utxos.filter(
        (utxo) => utxo.address === address
    );

    const selected = [];
    let total = 0;

    for (const utxo of ownedUTXOs) {
        selected.push(utxo);
        total += utxo.amount;

        if (total >= requiredAmount) {
            return {
                selected,
                total,
                change: total - requiredAmount,
            };
        }
    }

    throw new Error("Insufficient funds.");
}