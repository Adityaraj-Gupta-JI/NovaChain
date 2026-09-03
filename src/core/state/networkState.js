import { Blockchain } from "../block/blockchain.js";
import { Mempool } from "../mempool/mempool.js";

import {
    createTransaction,
    createCoinbaseTransaction,
    finalizeCoinbaseTransaction,
    signTransaction,
} from "../transaction/transaction.js";

import { validateTransaction } from "../transaction/validator.js";

import {
    applyTransactionsToUTXOSet,
    getBalance,
    selectUTXOs,
} from "../transaction/utxo.js";

import { createBlock } from "../block/block.js";
import { mineBlock } from "../mining/proofofWork.js";

const MINING_REWARD = 50_000;

export class NetworkState {
    constructor() {
        this.blockchain = new Blockchain();
        this.mempool = new Mempool();

        this.utxos = [];

        this.initialized = false;
        this.isMining = false;
    }

    async initialize() {
        if (this.initialized) {
            return this;
        }

        await this.blockchain.initialize();

        this.initialized = true;

        return this;
    }

    getLatestBlock() {
        return this.blockchain.getLatestBlock();
    }

    getChain() {
        return this.blockchain.chain;
    }

    getUTXOs() {
        return [...this.utxos];
    }

    getMempoolTransactions() {
        return this.mempool.getTransactions();
    }

    getBalance(address) {
        return getBalance(this.utxos, address);
    }

    async createPayment({
        wallet,
        recipientAddress,
        amount,
    }) {
        if (!this.initialized) {
            throw new Error(
                "Network state is not initialized."
            );
        }

        if (!wallet?.address) {
            throw new Error(
                "A valid wallet is required."
            );
        }

        if (
            typeof recipientAddress !== "string" ||
            recipientAddress.length === 0
        ) {
            throw new Error(
                "A valid recipient address is required."
            );
        }

        if (
            !Number.isSafeInteger(amount) ||
            amount <= 0
        ) {
            throw new Error(
                "Amount must be a positive safe integer."
            );
        }

        /*
         * UTXO selection.
         *
         * selectUTXOs() returns:
         *
         * {
         *     selected: Array,
         *     total: number,
         *     change: number
         * }
         */
        const selection = selectUTXOs(
            this.utxos,
            wallet.address,
            amount
        );

        const selectedUTXOs = selection.selected;
        const inputValue = selection.total;
        const change = selection.change;

        if (!Array.isArray(selectedUTXOs)) {
            throw new Error(
                "UTXO selection returned an invalid result."
            );
        }

        /*
         * Construct transaction outputs.
         *
         * Recipient receives the requested amount.
         * Any remaining value returns to the sender.
         */
        const outputs = [
            {
                address: recipientAddress,
                amount,
            },
        ];

        if (change > 0) {
            outputs.push({
                address: wallet.address,
                amount: change,
            });
        }

        /*
         * Convert selected UTXOs into transaction inputs.
         */
        const inputs = selectedUTXOs.map(
            (utxo) => ({
                transactionId:
                    utxo.transactionId,

                outputIndex:
                    utxo.outputIndex,
            })
        );

        const transaction = createTransaction({
            inputs,
            outputs,
        });

        /*
         * Sign the transaction using the sender wallet.
         */
        await signTransaction(
            transaction,
            wallet.privateKey,
            wallet.publicKey
        );

        /*
         * Validate against the current UTXO set
         * before entering the mempool.
         */
        const valid = await validateTransaction(
            transaction,
            this.utxos
        );

        if (!valid) {
            throw new Error(
                "Transaction validation failed."
            );
        }

        /*
         * Add valid transaction to the mempool.
         */
        this.mempool.add(transaction);

        return transaction;
    }

    async minePendingTransactions({
        minerAddress,
        difficulty = 3,
        onProgress,
        signal,
    }) {
        if (!this.initialized) {
            throw new Error(
                "Network state is not initialized."
            );
        }

        if (this.isMining) {
            throw new Error(
                "Mining is already in progress."
            );
        }

        if (
            typeof minerAddress !== "string" ||
            minerAddress.length === 0
        ) {
            throw new Error(
                "A valid miner address is required."
            );
        }

        if (
            !Number.isInteger(difficulty) ||
            difficulty < 0 ||
            difficulty > 64
        ) {
            throw new Error(
                "Invalid mining difficulty."
            );
        }

        this.isMining = true;

        try {
            /*
             * Snapshot the current mempool.
             *
             * These transactions will be included
             * in the block being mined.
             */
            const pendingTransactions =
                this.mempool.getTransactions();

            /*
             * Create miner reward transaction.
             */
            const coinbase =
                createCoinbaseTransaction({
                    minerAddress,
                    reward: MINING_REWARD,
                });

            await finalizeCoinbaseTransaction(
                coinbase
            );

            /*
             * Coinbase must be the first transaction
             * in the block.
             */
            const transactions = [
                coinbase,
                ...pendingTransactions,
            ];

            const latestBlock =
                this.getLatestBlock();

            /*
             * Create candidate block.
             */
            const block = await createBlock({
                index: latestBlock.index + 1,

                previousHash:
                    latestBlock.hash,

                transactions,

                difficulty,
            });

            /*
             * Execute Proof of Work.
             */
            await mineBlock(block, {
                onProgress,
                signal,
            });

            /*
             * Blockchain performs final block-level
             * validation, including:
             *
             * - index
             * - previous hash
             * - transaction IDs
             * - Merkle root
             * - block hash
             * - Proof of Work
             */
            const validBlock =
                await this.blockchain.addBlock(
                    block
                );

            /*
             * Only after the block has been accepted
             * do we update the UTXO state.
             */
            this.utxos =
                applyTransactionsToUTXOSet(
                    this.utxos,
                    transactions
                );

            /*
             * Transactions successfully included
             * in the block are no longer pending.
             */
            this.mempool.removeTransactions(
                pendingTransactions
            );

            return validBlock;
        } finally {
            this.isMining = false;
        }
    }

    async addExternalBlock(block) {
        if (!this.initialized) {
            throw new Error(
                "Network state is not initialized."
            );
        }

        /*
         * Validate and append the block first.
         */
        const validBlock =
            await this.blockchain.addBlock(
                block
            );

        /*
         * Apply accepted transactions to local
         * UTXO state.
         */
        this.utxos =
            applyTransactionsToUTXOSet(
                this.utxos,
                block.transactions
            );

        /*
         * Remove transactions that have now
         * been confirmed by the external block.
         *
         * Coinbase is excluded because it is not
         * normally present in the mempool.
         */
        const regularTransactions =
            block.transactions.filter(
                (transaction) =>
                    transaction.type !== "coinbase"
            );

        this.mempool.removeTransactions(
            regularTransactions
        );

        return validBlock;
    }

    clearMempool() {
        this.mempool.clear();
    }

    getStateSnapshot() {
        return {
            initialized:
                this.initialized,

            chainHeight:
                this.blockchain.chain.length - 1,

            blocks:
                this.blockchain.chain,

            utxos:
                this.utxos,

            mempool:
                this.mempool.getTransactions(),

            isMining:
                this.isMining,
        };
    }
}

export const networkState =
    new NetworkState();