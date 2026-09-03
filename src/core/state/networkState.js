import { Blockchain } from "../block/blockchain.js";
import { Mempool } from "../mempool/mempool.js";

import {
    createTransaction,
    createCoinbaseTransaction,
    finalizeCoinbaseTransaction,
    signTransaction,
} from "../transaction/transaction.js";

import {
    validateTransaction,
} from "../transaction/validator.js";

import {
    applyTransactionsToUTXOSet,
    getBalance,
    selectUTXOs,
} from "../transaction/utxo.js";

import {
    createBlock,
} from "../block/block.js";

import {
    mineBlock,
} from "../mining/proofofWork.js";


const MINING_REWARD = 50_000;


/**
 * NetworkState
 *
 * Coordinates the current local NovaChain node state.
 *
 * Responsibilities:
 * - Blockchain state
 * - UTXO state
 * - Mempool state
 * - Transaction creation
 * - Transaction validation
 * - Block creation
 * - Proof-of-Work mining
 * - External block acceptance
 *
 * This class does not implement cryptography,
 * transaction validation rules, block hashing,
 * Merkle trees, or Proof of Work itself.
 *
 * Those responsibilities remain inside their
 * dedicated core modules.
 */
export class NetworkState {

    constructor() {
        this.blockchain = new Blockchain();

        this.mempool = new Mempool();

        this.utxos = [];

        this.initialized = false;

        this.isMining = false;
    }


    /**
     * Initialize the local blockchain state.
     */
    async initialize() {

        if (this.initialized) {
            return this;
        }

        await this.blockchain.initialize();

        this.initialized = true;

        return this;
    }


    /**
     * Return the latest block.
     */
    getLatestBlock() {

        return this.blockchain.getLatestBlock();
    }


    /**
     * Return the current blockchain.
     */
    getChain() {

        return this.blockchain.chain;
    }


    /**
     * Return a copy of the current UTXO set.
     */
    getUTXOs() {

        return [...this.utxos];
    }


    /**
     * Return all transactions currently
     * waiting in the mempool.
     */
    getMempoolTransactions() {

        return this.mempool.getTransactions();
    }


    /**
     * Return the current balance of an address.
     */
    getBalance(address) {

        return getBalance(
            address,
            this.utxos
        );
    }


    /**
     * Create, sign, validate, and add a
     * payment transaction to the mempool.
     */
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
            !recipientAddress
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
         * Select spendable UTXOs belonging
         * to the sender.
         */
        const selectedUTXOs = selectUTXOs(
            this.utxos,
            wallet.address,
            amount
        );


        /*
         * Calculate the total value of
         * selected inputs.
         */
        const inputValue =
            selectedUTXOs.reduce(
                (total, utxo) =>
                    total + utxo.amount,
                0
            );


        /*
         * Create recipient output.
         */
        const outputs = [
            {
                address: recipientAddress,
                amount,
            },
        ];


        /*
         * Return remaining value to
         * the sender as change.
         */
        const change =
            inputValue - amount;


        if (change > 0) {

            outputs.push({
                address: wallet.address,
                amount: change,
            });

        }


        /*
         * Convert selected UTXOs into
         * transaction inputs.
         */
        const inputs =
            selectedUTXOs.map(
                (utxo) => ({
                    transactionId:
                        utxo.transactionId,

                    outputIndex:
                        utxo.outputIndex,
                })
            );


        /*
         * Construct unsigned transaction.
         */
        const transaction =
            createTransaction({
                inputs,
                outputs,
            });


        /*
         * Sign transaction using the
         * sender's wallet.
         */
        await signTransaction(
            transaction,
            wallet.privateKey,
            wallet.publicKey
        );


        /*
         * Validate transaction against
         * the current local UTXO set.
         */
        const valid =
            await validateTransaction(
                transaction,
                this.utxos
            );


        if (!valid) {

            throw new Error(
                "Transaction validation failed."
            );

        }


        /*
         * Add valid transaction to
         * the local mempool.
         */
        this.mempool.add(
            transaction
        );


        return transaction;
    }


    /**
     * Mine all currently pending transactions.
     *
     * A coinbase transaction is automatically
     * added to reward the miner.
     */
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
            !minerAddress
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
             */
            const pendingTransactions =
                this.mempool.getTransactions();


            /*
             * Create miner reward.
             */
            const coinbase =
                createCoinbaseTransaction({
                    minerAddress,
                    reward: MINING_REWARD,
                });


            /*
             * Assign deterministic transaction ID.
             */
            await finalizeCoinbaseTransaction(
                coinbase
            );


            /*
             * Coinbase must appear first
             * in the block.
             */
            const transactions = [
                coinbase,
                ...pendingTransactions,
            ];


            /*
             * Get previous block.
             */
            const latestBlock =
                this.getLatestBlock();


            /*
             * Construct candidate block.
             */
            const block =
                await createBlock({
                    index:
                        latestBlock.index + 1,

                    previousHash:
                        latestBlock.hash,

                    transactions,

                    difficulty,
                });


            /*
             * Perform Proof of Work.
             */
            await mineBlock(
                block,
                {
                    onProgress,
                    signal,
                }
            );


            /*
             * Validate and append the
             * mined block to the chain.
             */
            const validBlock =
                await this.blockchain.addBlock(
                    block
                );


            /*
             * Update local UTXO state.
             */
            this.utxos =
                applyTransactionsToUTXOSet(
                    this.utxos,
                    transactions
                );


            /*
             * Remove successfully mined
             * transactions from mempool.
             */
            this.mempool.removeTransactions(
                pendingTransactions
            );


            return validBlock;

        } finally {

            this.isMining = false;

        }
    }


    /**
     * Accept a block received from another node.
     *
     * Full network synchronization will use
     * this method later.
     */
    async addExternalBlock(block) {

        if (!this.initialized) {

            throw new Error(
                "Network state is not initialized."
            );

        }


        /*
         * Blockchain performs structural,
         * hash, Merkle, linkage, and PoW checks.
         */
        const validBlock =
            await this.blockchain.addBlock(
                block
            );


        /*
         * Apply the accepted block's
         * transactions to local UTXO state.
         */
        this.utxos =
            applyTransactionsToUTXOSet(
                this.utxos,
                block.transactions
            );


        /*
         * Remove transactions that were
         * included in the accepted block.
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


    /**
     * Remove all pending transactions
     * from the local mempool.
     */
    clearMempool() {

        this.mempool.clear();
    }


    /**
     * Return a serializable snapshot of
     * the current local node state.
     */
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


/**
 * Application-wide NovaChain state.
 *
 * The class above remains reusable for testing
 * and future multi-node simulations, while this
 * singleton represents the current browser node.
 */
export const networkState =
    new NetworkState();