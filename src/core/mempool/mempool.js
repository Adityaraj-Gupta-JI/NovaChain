/**
 * NovaChain Mempool
 *
 * Stores valid pending transactions waiting
 * to be included in a block.
 */
export class Mempool {
    constructor() {
        this.transactions = new Map();
    }

    add(transaction) {
        if (
            !transaction ||
            typeof transaction !== "object"
        ) {
            throw new TypeError(
                "Invalid transaction."
            );
        }

        if (
            typeof transaction.id !== "string" ||
            !transaction.id
        ) {
            throw new Error(
                "Transaction must have an ID."
            );
        }

        if (
            this.transactions.has(
                transaction.id
            )
        ) {
            throw new Error(
                "Transaction already exists in mempool."
            );
        }

        this.transactions.set(
            transaction.id,
            transaction
        );

        return transaction;
    }

    has(transactionId) {
        return this.transactions.has(
            transactionId
        );
    }

    get(transactionId) {
        return this.transactions.get(
            transactionId
        );
    }

    remove(transactionId) {
        return this.transactions.delete(
            transactionId
        );
    }

    getTransactions() {
        return Array.from(
            this.transactions.values()
        );
    }

    clear() {
        this.transactions.clear();
    }

    removeTransactions(
        transactions
    ) {
        for (
            const transaction
            of transactions
        ) {
            if (transaction?.id) {
                this.transactions.delete(
                    transaction.id
                );
            }
        }
    }

    get size() {
        return this.transactions.size;
    }
}