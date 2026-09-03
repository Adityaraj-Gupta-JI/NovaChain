import {
    createBlock,
    calculateBlockHash,
} from "./block.js";

import { calculateMerkleRoot } from "./merkle.js";

/**
 * NovaChain Blockchain
 *
 * Responsible for:
 * - Maintaining the local blockchain
 * - Creating the genesis block
 * - Adding validated blocks
 * - Verifying chain integrity
 * - Checking block hashes
 * - Checking Merkle roots
 * - Checking Proof of Work
 * - Providing basic UTXO balance calculation
 */
export class Blockchain {
    constructor() {
        this.chain = [];
    }

    /**
     * Initialize the blockchain.
     *
     * Creates the genesis block if the chain
     * has not already been initialized.
     */
    async initialize() {
        if (this.chain.length > 0) {
            return;
        }

        const genesis = await this.createGenesisBlock();

        this.chain.push(genesis);
    }

    /**
     * Create the NovaChain genesis block.
     *
     * The genesis block is special:
     * - index = 0
     * - previousHash = 64 zeroes
     * - no transactions
     * - difficulty = 0
     *
     * Genesis does not require Proof of Work.
     */
    async createGenesisBlock() {
        const genesis = await createBlock({
            index: 0,
            previousHash: "0".repeat(64),
            transactions: [],
            difficulty: 0,
        });

        genesis.hash = await calculateBlockHash(genesis);

        return genesis;
    }

    /**
     * Return the latest block in the chain.
     */
    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    /**
     * Validate and add a block to the local chain.
     *
     * Validation performed:
     * 1. Blockchain must be initialized.
     * 2. Block index must follow the latest block.
     * 3. Previous hash must match the latest block.
     * 4. Block hash must be correctly calculated.
     * 5. Merkle root must match the transactions.
     * 6. Non-genesis blocks must satisfy Proof of Work.
     */
    async addBlock(block) {
        const latestBlock = this.getLatestBlock();

        if (!latestBlock) {
            throw new Error(
                "Blockchain is not initialized."
            );
        }

        if (!block || typeof block !== "object") {
            throw new TypeError(
                "Invalid block."
            );
        }

        /*
         * --------------------------------------------------
         * 1. Validate block index
         * --------------------------------------------------
         */
        if (
            block.index !== latestBlock.index + 1
        ) {
            throw new Error(
                "Invalid block index."
            );
        }

        /*
         * --------------------------------------------------
         * 2. Validate previous block hash
         * --------------------------------------------------
         */
        if (
            block.previousHash !== latestBlock.hash
        ) {
            throw new Error(
                "Invalid previous block hash."
            );
        }

        /*
         * --------------------------------------------------
         * 3. Validate block transactions
         * --------------------------------------------------
         */
        if (!Array.isArray(block.transactions)) {
            throw new Error(
                "Block transactions must be an array."
            );
        }

        for (const transaction of block.transactions) {
            if (
                !transaction ||
                typeof transaction.id !== "string" ||
                transaction.id.length !== 64
            ) {
                throw new Error(
                    "Block contains a transaction with an invalid ID."
                );
            }
        }

        /*
         * --------------------------------------------------
         * 4. Recalculate and validate Merkle root
         * --------------------------------------------------
         */
        const transactionIds =
            block.transactions.map(
                (transaction) => transaction.id
            );

        const calculatedMerkleRoot =
            await calculateMerkleRoot(transactionIds);

        if (
            block.merkleRoot !==
            calculatedMerkleRoot
        ) {
            throw new Error(
                "Invalid Merkle root."
            );
        }

        /*
         * --------------------------------------------------
         * 5. Recalculate and validate block hash
         * --------------------------------------------------
         */
        const calculatedHash =
            await calculateBlockHash(block);

        if (calculatedHash !== block.hash) {
            throw new Error(
                "Invalid block hash."
            );
        }

        /*
         * --------------------------------------------------
         * 6. Validate Proof of Work
         *
         * Genesis is excluded because it has
         * difficulty = 0.
         * --------------------------------------------------
         */
        if (block.index !== 0) {
            if (
                !Number.isInteger(block.difficulty) ||
                block.difficulty < 0 ||
                block.difficulty > 64
            ) {
                throw new Error(
                    "Invalid Proof of Work difficulty."
                );
            }

            const targetPrefix =
                "0".repeat(block.difficulty);

            if (
                !block.hash.startsWith(targetPrefix)
            ) {
                throw new Error(
                    "Block does not satisfy Proof of Work."
                );
            }
        }

        /*
         * --------------------------------------------------
         * Block has passed all blockchain-level checks.
         * --------------------------------------------------
         */
        this.chain.push(block);

        return block;
    }

    /**
     * Validate the complete blockchain.
     *
     * Returns:
     * - true  -> chain is valid
     * - false -> chain is invalid
     */
    async isValid() {
        if (this.chain.length === 0) {
            return false;
        }

        for (
            let i = 0;
            i < this.chain.length;
            i++
        ) {
            const block = this.chain[i];

            /*
             * ----------------------------------------------
             * Validate basic block structure
             * ----------------------------------------------
             */
            if (!block || typeof block !== "object") {
                return false;
            }

            if (!Number.isInteger(block.index)) {
                return false;
            }

            if (
                typeof block.previousHash !==
                "string"
            ) {
                return false;
            }

            if (
                typeof block.hash !== "string"
            ) {
                return false;
            }

            /*
             * ----------------------------------------------
             * Validate transaction list
             * ----------------------------------------------
             */
            if (!Array.isArray(block.transactions)) {
                return false;
            }

            for (const transaction of block.transactions) {
                if (
                    !transaction ||
                    typeof transaction.id !==
                        "string" ||
                    transaction.id.length !== 64
                ) {
                    return false;
                }
            }

            /*
             * ----------------------------------------------
             * Recalculate block hash
             * ----------------------------------------------
             */
            const calculatedHash =
                await calculateBlockHash(block);

            if (
                block.hash !== calculatedHash
            ) {
                return false;
            }

            /*
             * ----------------------------------------------
             * Recalculate Merkle root
             * ----------------------------------------------
             */
            const transactionIds =
                block.transactions.map(
                    (transaction) =>
                        transaction.id
                );

            const calculatedMerkleRoot =
                await calculateMerkleRoot(
                    transactionIds
                );

            if (
                block.merkleRoot !==
                calculatedMerkleRoot
            ) {
                return false;
            }

            /*
             * ----------------------------------------------
             * Genesis block validation
             * ----------------------------------------------
             */
            if (i === 0) {
                if (block.index !== 0) {
                    return false;
                }

                if (
                    block.previousHash !==
                    "0".repeat(64)
                ) {
                    return false;
                }

                /*
                 * Genesis block does not require PoW.
                 */
                continue;
            }

            const previousBlock =
                this.chain[i - 1];

            /*
             * ----------------------------------------------
             * Validate chain linkage
             * ----------------------------------------------
             */
            if (
                block.previousHash !==
                previousBlock.hash
            ) {
                return false;
            }

            /*
             * ----------------------------------------------
             * Validate sequential block index
             * ----------------------------------------------
             */
            if (
                block.index !==
                previousBlock.index + 1
            ) {
                return false;
            }

            /*
             * ----------------------------------------------
             * Validate Proof of Work
             * ----------------------------------------------
             */
            if (
                !Number.isInteger(block.difficulty) ||
                block.difficulty < 0 ||
                block.difficulty > 64
            ) {
                return false;
            }

            const targetPrefix =
                "0".repeat(block.difficulty);

            if (
                !block.hash.startsWith(
                    targetPrefix
                )
            ) {
                return false;
            }
        }

        return true;
    }

    /**
     * Calculate an address balance from a UTXO set.
     *
     * The UTXO set is supplied by the caller because
     * Blockchain itself does not yet maintain the global
     * UTXO state.
     */
    getBalance(address, utxos) {
        if (
            typeof address !== "string" ||
            !address
        ) {
            throw new Error(
                "Invalid address."
            );
        }

        if (!Array.isArray(utxos)) {
            throw new TypeError(
                "UTXOs must be an array."
            );
        }

        return utxos
            .filter(
                (utxo) =>
                    utxo.address === address
            )
            .reduce(
                (total, utxo) =>
                    total + utxo.amount,
                0
            );
    }
}