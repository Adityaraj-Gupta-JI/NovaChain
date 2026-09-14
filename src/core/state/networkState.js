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

import { createBlock } from "../block/block.js";
import { mineBlock } from "../mining/proofofWork.js";

import {
    PROTOCOL,
    calculateBlockWork,
    calculateChainWork,
    chainWorkToString,
    compareChains,
    getBlockReward,
    getNextDifficulty,
} from "../consensus/protocol.js";

/*
|--------------------------------------------------------------------------
| NovaChain Network State
|--------------------------------------------------------------------------
|
| Authoritative local runtime:
|
| Wallet
|   ↓
| Transaction
|   ↓
| Mempool
|   ↓
| Block Builder
|   ↓
| Proof of Work
|   ↓
| Blockchain
|   ↓
| UTXO reconstruction
|
| Core invariant:
|
|     BLOCKCHAIN -> VALIDATED STATE -> UTXO SET
|
| The blockchain is the source of truth.
| The UTXO set is derived state.
|--------------------------------------------------------------------------
*/

const DB_NAME =
    "novachain-ledger";

const DB_VERSION = 2;

const STORE_NAME =
    "network";

const STATE_KEY =
    "local-state";

export class NetworkState {
    constructor() {
        this.blockchain =
            new Blockchain();

        this.mempool =
            new Mempool();

        this.utxos = [];

        this.initialized =
            false;

        this.isMining =
            false;

        this.networkTransport =
            null;

        this.pendingRemoteTransactions =
            [];

        this.persistenceAvailable =
            typeof indexedDB !==
            "undefined";
    }

    async initialize() {
        if (
            this.initialized
        ) {
            return this;
        }

        await this.blockchain
            .initialize();

        const restored =
            await this.restoreState();

        if (
            !restored
        ) {
            this.utxos = [];

            this.mempool.clear();

            await this.persistState();
        }

        this.initialized =
            true;

        return this;
    }

    attachNetworkTransport(
        transport
    ) {
        this.networkTransport =
            transport ??
            null;

        return this;
    }

    getNetworkStatus() {
        const status =
            this.networkTransport
                ?.statusSnapshot;

        return {
            connected:
                Boolean(
                    this.networkTransport
                        ?.connected
                ),

            status:
                status?.status ??
                (
                    this.networkTransport
                        ?.connected
                        ? "ONLINE"
                        : "OFFLINE"
                ),

            peerCount:
                Number(
                    status?.peerCount ??
                    0
                ),

            signalingUrl:
                status?.url ??
                null,
        };
    }

    getLatestBlock() {
        return this.blockchain
            .getLatestBlock();
    }

    getChain() {
        return [
            ...this.blockchain.chain,
        ];
    }

    getUTXOs() {
        return [
            ...this.utxos,
        ];
    }

    getMempoolTransactions() {
        return this.mempool
            .getTransactions();
    }

    getBalance(
        address
    ) {
        return getBalance(
            this.utxos,
            address
        );
    }

    getChainWork() {
        return calculateChainWork(
            this.getChain()
        );
    }

    getChainWorkString() {
        return chainWorkToString(
            this.getChain()
        );
    }

    getNextDifficulty() {
        return getNextDifficulty(
            this.getChain()
        );
    }

    getCurrentBlockReward() {
        const latest =
            this.getLatestBlock();

        return getBlockReward(
            (latest?.index ?? 0) + 1
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Dashboard / UI Snapshot API
    |--------------------------------------------------------------------------
    |
    | This method is intentionally kept as a stable public API.
    |
    | dashboard.js calls:
    |
    |     networkState.getStateSnapshot()
    |
    | Therefore all runtime changes must preserve this method.
    |--------------------------------------------------------------------------
    */

    getStateSnapshot() {
        const chain =
            this.getChain();

        const latestBlock =
            chain.length > 0
                ? chain[
                    chain.length - 1
                ]
                : null;

        const miningInfo =
            this.getMiningInfo();

        return {
            initialized:
                this.initialized,

            chainHeight:
                latestBlock?.index ??
                0,

            blocks:
                chain,

            utxos:
                this.getUTXOs(),

            mempool:
                this.getMempoolTransactions(),

            isMining:
                this.isMining,

            network:
                this.getNetworkStatus(),

            /*
             * Additional hardened
             * blockchain telemetry.
             */
            difficulty:
                latestBlock?.difficulty ??
                0,

            nextDifficulty:
                miningInfo
                    .nextDifficulty,

            miningReward:
                miningInfo
                    .nextReward,

            chainWork:
                this.getChainWorkString(),

            nextBlockHeight:
                miningInfo
                    .nextHeight,

            miningEligible:
                miningInfo
                    .canMine,

            miningReason:
                miningInfo
                    .reason,

            protocol: {
                version:
                    PROTOCOL.version,

                networkId:
                    PROTOCOL.networkId,

                targetBlockTimeMs:
                    PROTOCOL
                        .targetBlockTimeMs,

                difficultyAdjustmentInterval:
                    PROTOCOL
                        .difficultyAdjustmentInterval,

                minDifficulty:
                    PROTOCOL
                        .minDifficulty,

                maxDifficulty:
                    PROTOCOL
                        .maxDifficulty,

                maxTransactionsPerBlock:
                    PROTOCOL
                        .maxTransactionsPerBlock,
            },
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Mining Eligibility
    |--------------------------------------------------------------------------
    */

    canMine() {
        const height =
            this.getLatestBlock()
                ?.index ?? 0;

        /*
         * First block:
         *
         * Creates the first spendable
         * balance.
         */
        if (
            height === 0
        ) {
            return {
                allowed:
                    true,

                reason:
                    "CREATE_INITIAL_BLOCK",
            };
        }

        /*
         * After initial funding,
         * only mine when there is
         * actual payment work.
         */
        if (
            this.mempool.size > 0
        ) {
            return {
                allowed:
                    true,

                reason:
                    "PENDING_TRANSACTIONS",
            };
        }

        return {
            allowed:
                false,

            reason:
                "NO_PENDING_WORK",
        };
    }

    getMiningInfo() {
        const nextHeight =
            (
                this.getLatestBlock()
                    ?.index ?? 0
            ) + 1;

        const nextDifficulty =
            this.getNextDifficulty();

        const reward =
            getBlockReward(
                nextHeight
            );

        const eligibility =
            this.canMine();

        return {
            nextHeight,

            nextDifficulty,

            nextReward:
                reward,

            rewardUnit:
                "NNC",

            maxTransactions:
                PROTOCOL
                    .maxTransactionsPerBlock,

            targetBlockTimeMs:
                PROTOCOL
                    .targetBlockTimeMs,

            adjustmentInterval:
                PROTOCOL
                    .difficultyAdjustmentInterval,

            minDifficulty:
                PROTOCOL
                    .minDifficulty,

            maxDifficulty:
                PROTOCOL
                    .maxDifficulty,

            chainWork:
                this.getChainWorkString(),

            canMine:
                eligibility.allowed,

            reason:
                eligibility.reason,
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Spendable UTXOs
    |--------------------------------------------------------------------------
    */

    getSpendableUTXOs(
        address
    ) {
        const pendingInputs =
            new Set();

        for (
            const transaction
            of this.mempool
                .getTransactions()
        ) {
            for (
                const input
                of transaction.inputs ??
                []
            ) {
                pendingInputs.add(
                    `${input.transactionId}:${input.outputIndex}`
                );
            }
        }

        return this.utxos.filter(
            (utxo) =>
                utxo.address ===
                    address &&
                !pendingInputs.has(
                    `${utxo.transactionId}:${utxo.outputIndex}`
                )
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Create Payment
    |--------------------------------------------------------------------------
    */

    async createPayment({
        wallet,
        recipientAddress,
        amount,
    }) {
        this.requireInitialized();

        if (
            !wallet?.address
        ) {
            throw new Error(
                "A valid wallet is required."
            );
        }

        if (
            typeof recipientAddress !==
                "string" ||
            recipientAddress
                .trim()
                .length === 0
        ) {
            throw new Error(
                "A valid recipient address is required."
            );
        }

        const recipient =
            recipientAddress.trim();

        if (
            recipient ===
            wallet.address
        ) {
            throw new Error(
                "Sending to the same wallet is not allowed in the demo runtime."
            );
        }

        if (
            !Number.isSafeInteger(
                amount
            ) ||
            amount <= 0
        ) {
            throw new Error(
                "Amount must be a positive safe integer."
            );
        }

        const spendableUTXOs =
            this.getSpendableUTXOs(
                wallet.address
            );

        const selection =
            selectUTXOs(
                spendableUTXOs,
                wallet.address,
                amount
            );

        const selectedUTXOs =
            selection.selected;

        if (
            !Array.isArray(
                selectedUTXOs
            ) ||
            selectedUTXOs.length ===
                0
        ) {
            throw new Error(
                "Insufficient spendable balance."
            );
        }

        const change =
            selection.change;

        const inputs =
            selectedUTXOs.map(
                (utxo) => ({
                    transactionId:
                        utxo.transactionId,

                    outputIndex:
                        utxo.outputIndex,
                })
            );

        const outputs = [
            {
                address:
                    recipient,

                amount,
            },
        ];

        if (
            change > 0
        ) {
            outputs.push({
                address:
                    wallet.address,

                amount:
                    change,
            });
        }

        const transaction =
            createTransaction({
                inputs,
                outputs,
            });

        await signTransaction(
            transaction,
            wallet.privateKey,
            wallet.publicKey
        );

        const valid =
            await validateTransaction(
                transaction,
                this.utxos
            );

        if (
            !valid
        ) {
            throw new Error(
                "Transaction validation failed."
            );
        }

        this.assertNoPendingDoubleSpend(
            transaction
        );

        this.mempool.add(
            transaction
        );

        await this.persistState();

        this.networkTransport
            ?.broadcastTransaction(
                transaction
            );

        return transaction;
    }

    /*
    |--------------------------------------------------------------------------
    | Mine Pending Transactions
    |--------------------------------------------------------------------------
    */

    async minePendingTransactions({
        minerAddress,
        onProgress,
        signal,
    }) {
        this.requireInitialized();

        if (
            this.isMining
        ) {
            throw new Error(
                "Mining is already in progress."
            );
        }

        if (
            typeof minerAddress !==
                "string" ||
            minerAddress
                .trim()
                .length ===
                0
        ) {
            throw new Error(
                "A valid miner address is required."
            );
        }

        const eligibility =
            this.canMine();

        if (
            !eligibility.allowed
        ) {
            throw new Error(
                "No pending blockchain work. Submit a transaction before mining another block."
            );
        }

        /*
         * Consensus decides difficulty.
         */
        const difficulty =
            this.getNextDifficulty();

        const nextHeight =
            this.getLatestBlock()
                .index + 1;

        const reward =
            getBlockReward(
                nextHeight
            );

        if (
            reward <= 0
        ) {
            throw new Error(
                "Mining reward has reached zero under the current issuance schedule."
            );
        }

        this.isMining =
            true;

        const parentHash =
            this.getLatestBlock()
                .hash;

        try {
            const pendingTransactions =
                await this
                    .getValidPendingTransactionsForBlock();

            const coinbase =
                createCoinbaseTransaction({
                    minerAddress:
                        minerAddress.trim(),

                    reward,
                });

            await finalizeCoinbaseTransaction(
                coinbase
            );

            const transactions = [
                coinbase,
                ...pendingTransactions,
            ];

            if (
                transactions.length >
                PROTOCOL
                    .maxTransactionsPerBlock
            ) {
                throw new Error(
                    "The block would exceed the protocol transaction limit."
                );
            }

            const currentParent =
                this.getLatestBlock();

            if (
                currentParent.hash !==
                parentHash
            ) {
                this.networkTransport
                    ?.requestState();

                throw new Error(
                    "Mining target changed before Proof of Work started."
                );
            }

            const block =
                await createBlock({
                    index:
                        nextHeight,

                    previousHash:
                        currentParent.hash,

                    transactions,

                    difficulty,
                });

            await mineBlock(
                block,
                {
                    onProgress,
                    signal,
                }
            );

            /*
             * Another node may have produced
             * a block while this browser mined.
             */
            if (
                this.getLatestBlock()
                    .hash !==
                parentHash
            ) {
                this.networkTransport
                    ?.requestState();

                throw new Error(
                    "Mined block became stale because another chain update arrived first."
                );
            }

            const validBlock =
                await this.blockchain
                    .addBlock(
                        block
                    );

            /*
             * Rebuild authoritative UTXO state.
             */
            this.utxos =
                await this.rebuildUTXOSet(
                    this.getChain()
                );

            this.mempool
                .removeTransactions(
                    pendingTransactions
                );

            await this
                .removeConflictingMempoolTransactions();

            await this.persistState();

            this.networkTransport
                ?.broadcastBlock(
                    validBlock
                );

            return validBlock;
        } finally {
            this.isMining =
                false;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Incoming Block
    |--------------------------------------------------------------------------
    */

    async addExternalBlock(
        block
    ) {
        this.requireInitialized();

        if (
            !block ||
            typeof block !==
                "object"
        ) {
            return false;
        }

        const latest =
            this.getLatestBlock();

        if (
            block.index ===
                latest.index + 1 &&
            block.previousHash ===
                latest.hash
        ) {
            const previousChain =
                this.getChain();

            try {
                const validBlock =
                    await this.blockchain
                        .addBlock(
                            block
                        );

                await this.validateChain(
                    this.getChain()
                );

                this.utxos =
                    await this.rebuildUTXOSet(
                        this.getChain()
                    );

                const included =
                    block.transactions
                        ?.filter(
                            (transaction) =>
                                transaction
                                    ?.type !==
                                "coinbase"
                        ) ??
                    [];

                this.mempool
                    .removeTransactions(
                        included
                    );

                await this
                    .removeConflictingMempoolTransactions();

                await this.persistState();

                return validBlock;
            } catch (
                error
            ) {
                this.blockchain.chain =
                    previousChain;

                console.warn(
                    "NovaChain rejected external block:",
                    error
                );

                this.networkTransport
                    ?.requestState();

                return false;
            }
        }

        this.networkTransport
            ?.requestState();

        return false;
    }

    /*
    |--------------------------------------------------------------------------
    | Remote Transaction
    |--------------------------------------------------------------------------
    */

    async receiveRemoteTransaction(
        transaction
    ) {
        this.requireInitialized();

        if (
            !transaction?.id
        ) {
            return false;
        }

        if (
            this.mempool.has(
                transaction.id
            )
        ) {
            return false;
        }

        const alreadyConfirmed =
            this.getChain().some(
                (block) =>
                    block.transactions?.some(
                        (candidate) =>
                            candidate?.id ===
                            transaction.id
                    )
            );

        if (
            alreadyConfirmed
        ) {
            return false;
        }

        let valid =
            false;

        try {
            valid =
                await validateTransaction(
                    transaction,
                    this.utxos
                );
        } catch {
            valid =
                false;
        }

        if (
            !valid
        ) {
            this.queueRemoteTransaction(
                transaction
            );

            this.networkTransport
                ?.requestState();

            return false;
        }

        try {
            this.assertNoPendingDoubleSpend(
                transaction
            );
        } catch {
            return false;
        }

        this.mempool.add(
            transaction
        );

        await this.persistState();

        return true;
    }

    /*
    |--------------------------------------------------------------------------
    | Remote State
    |--------------------------------------------------------------------------
    */

    async adoptRemoteState(
        state
    ) {
        this.requireInitialized();

        if (
            !state ||
            !Array.isArray(
                state.blocks
            ) ||
            state.blocks.length ===
                0
        ) {
            return false;
        }

        const candidateChain =
            state.blocks.map(
                (block) =>
                    typeof structuredClone ===
                    "function"
                        ? structuredClone(
                            block
                        )
                        : JSON.parse(
                            JSON.stringify(
                                block
                            )
                        )
            );

        const localChain =
            this.getChain();

        if (
            compareChains(
                localChain,
                candidateChain
            ) <= 0
        ) {
            return false;
        }

        const previousChain =
            this.getChain();

        try {
            await this.validateChain(
                candidateChain
            );

            this.blockchain.chain =
                candidateChain;

            this.utxos =
                await this.rebuildUTXOSet(
                    candidateChain
                );

            this.mempool.clear();

            await this.restoreValidMempool(
                state.mempool
            );

            await this
                .removeConflictingMempoolTransactions();

            await this.persistState();

            await this
                .retryPendingRemoteTransactions();

            return true;
        } catch (
            error
        ) {
            this.blockchain.chain =
                previousChain;

            console.warn(
                "NovaChain remote state rejected:",
                error
            );

            return false;
        }
    }

    async retryPendingRemoteTransactions() {
        if (
            !this.pendingRemoteTransactions
                .length
        ) {
            return;
        }

        const queued = [
            ...this.pendingRemoteTransactions,
        ];

        this.pendingRemoteTransactions =
            [];

        for (
            const transaction
            of queued
        ) {
            try {
                await this
                    .receiveRemoteTransaction(
                        transaction
                    );
            } catch (
                error
            ) {
                console.warn(
                    "NovaChain queued transaction could not be applied:",
                    error
                );
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Mempool
    |--------------------------------------------------------------------------
    */

    clearMempool() {
        this.mempool.clear();

        void this.persistState();
    }

    assertNoPendingDoubleSpend(
        transaction
    ) {
        const pendingInputs =
            new Set();

        for (
            const pending
            of this.mempool
                .getTransactions()
        ) {
            for (
                const input
                of pending.inputs ??
                []
            ) {
                pendingInputs.add(
                    `${input.transactionId}:${input.outputIndex}`
                );
            }
        }

        for (
            const input
            of transaction.inputs ??
            []
        ) {
            const key =
                `${input.transactionId}:${input.outputIndex}`;

            if (
                pendingInputs.has(
                    key
                )
            ) {
                throw new Error(
                    "One or more inputs are already reserved by the mempool."
                );
            }
        }
    }

    async getValidPendingTransactionsForBlock() {
        const pending =
            this.mempool
                .getTransactions();

        const validTransactions =
            [];

        let workingUTXOs = [
            ...this.utxos,
        ];

        for (
            const transaction
            of pending
        ) {
            if (
                validTransactions.length >=
                PROTOCOL
                    .maxTransactionsPerBlock -
                    1
            ) {
                break;
            }

            try {
                const valid =
                    await validateTransaction(
                        transaction,
                        workingUTXOs
                    );

                if (
                    !valid
                ) {
                    continue;
                }

                workingUTXOs =
                    applyTransactionsToUTXOSet(
                        workingUTXOs,
                        [transaction]
                    );

                validTransactions.push(
                    transaction
                );
            } catch {
                continue;
            }
        }

        return validTransactions;
    }

    async restoreValidMempool(
        persistedMempool
    ) {
        if (
            !Array.isArray(
                persistedMempool
            )
        ) {
            return;
        }

        for (
            const transaction
            of persistedMempool
        ) {
            if (
                !transaction?.id
            ) {
                continue;
            }

            const alreadyConfirmed =
                this.getChain().some(
                    (block) =>
                        block.transactions?.some(
                            (candidate) =>
                                candidate?.id ===
                                transaction.id
                        )
                );

            if (
                alreadyConfirmed
            ) {
                continue;
            }

            try {
                const valid =
                    await validateTransaction(
                        transaction,
                        this.utxos
                    );

                if (
                    !valid
                ) {
                    continue;
                }

                this.assertNoPendingDoubleSpend(
                    transaction
                );

                this.mempool.add(
                    transaction
                );
            } catch {
                /*
                 * Drop invalid persisted
                 * mempool entries.
                 */
            }
        }
    }

    async removeConflictingMempoolTransactions() {
        const transactions =
            this.mempool
                .getTransactions();

        this.mempool.clear();

        let workingUTXOs = [
            ...this.utxos,
        ];

        for (
            const transaction
            of transactions
        ) {
            try {
                const valid =
                    await validateTransaction(
                        transaction,
                        workingUTXOs
                    );

                if (
                    !valid
                ) {
                    continue;
                }

                this.assertNoPendingDoubleSpend(
                    transaction
                );

                workingUTXOs =
                    applyTransactionsToUTXOSet(
                        workingUTXOs,
                        [transaction]
                    );

                this.mempool.add(
                    transaction
                );
            } catch {
                /*
                 * Drop stale/conflicting
                 * transactions.
                 */
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Chain Validation
    |--------------------------------------------------------------------------
    */

    async validateChain(
        chain
    ) {
        if (
            !Array.isArray(
                chain
            ) ||
            chain.length ===
                0
        ) {
            throw new Error(
                "Candidate chain is empty."
            );
        }

        const previousChain =
            this.blockchain.chain;

        try {
            this.blockchain.chain =
                chain;

            const structureValid =
                await this.blockchain
                    .isValid();

            if (
                !structureValid
            ) {
                throw new Error(
                    "Candidate blockchain failed structural validation."
                );
            }

            this.validateChainDifficulty(
                chain
            );

            this.validateTimestampOrder(
                chain
            );

            await this.rebuildUTXOSet(
                chain
            );
        } finally {
            this.blockchain.chain =
                previousChain;
        }

        return true;
    }

    validateChainDifficulty(
        chain
    ) {
        for (
            let index = 1;
            index < chain.length;
            index += 1
        ) {
            const previousChain =
                chain.slice(
                    0,
                    index
                );

            const expected =
                getNextDifficulty(
                    previousChain
                );

            const actual =
                Number(
                    chain[index]
                        ?.difficulty
                );

            if (
                actual !==
                expected
            ) {
                throw new Error(
                    `Block #${
                        chain[index]?.index ??
                        index
                    } has difficulty ${actual}; expected ${expected}.`
                );
            }
        }
    }

    validateTimestampOrder(
        chain
    ) {
        for (
            let index = 1;
            index < chain.length;
            index += 1
        ) {
            const previous =
                Number(
                    chain[index - 1]
                        ?.timestamp
                );

            const current =
                Number(
                    chain[index]
                        ?.timestamp
                );

            if (
                !Number.isFinite(
                    previous
                ) ||
                !Number.isFinite(
                    current
                ) ||
                current <
                previous
            ) {
                throw new Error(
                    `Block #${
                        chain[index]?.index ??
                        index
                    } timestamp is earlier than its parent.`
                );
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Deterministic UTXO Reconstruction
    |--------------------------------------------------------------------------
    */

    async rebuildUTXOSet(
        chain
    ) {
        if (
            !Array.isArray(
                chain
            ) ||
            chain.length ===
                0
        ) {
            throw new Error(
                "Cannot rebuild UTXO state from an empty chain."
            );
        }

        let rebuilt = [];

        for (
            let blockIndex = 0;
            blockIndex < chain.length;
            blockIndex += 1
        ) {
            const block =
                chain[blockIndex];

            if (
                !Array.isArray(
                    block.transactions
                )
            ) {
                throw new Error(
                    `Block #${block.index} has no transaction array.`
                );
            }

            /*
             * Genesis remains non-spendable.
             */
            if (
                blockIndex === 0
            ) {
                continue;
            }

            const coinbaseTransactions =
                block.transactions.filter(
                    (transaction) =>
                        transaction
                            ?.type ===
                        "coinbase"
                );

            if (
                coinbaseTransactions.length !==
                1
            ) {
                throw new Error(
                    `Block #${block.index} must contain exactly one coinbase transaction.`
                );
            }

            if (
                block.transactions[0]
                    ?.type !==
                "coinbase"
            ) {
                throw new Error(
                    `Block #${block.index} coinbase must be the first transaction.`
                );
            }

            if (
                block.transactions.length >
                PROTOCOL
                    .maxTransactionsPerBlock
            ) {
                throw new Error(
                    `Block #${block.index} exceeds the transaction limit.`
                );
            }

            const coinbase =
                block.transactions[0];

            this.validateCoinbase(
                coinbase,
                block.index
            );

            rebuilt =
                applyTransactionsToUTXOSet(
                    rebuilt,
                    [coinbase]
                );

            for (
                const transaction
                of block.transactions
                    .slice(1)
            ) {
                const valid =
                    await validateTransaction(
                        transaction,
                        rebuilt
                    );

                if (
                    !valid
                ) {
                    throw new Error(
                        `Invalid transaction ${
                            transaction?.id ??
                            "unknown"
                        } in block #${
                            block.index
                        }.`
                    );
                }

                rebuilt =
                    applyTransactionsToUTXOSet(
                        rebuilt,
                        [transaction]
                    );
            }
        }

        return rebuilt;
    }

    /*
    |--------------------------------------------------------------------------
    | Coinbase Validation
    |--------------------------------------------------------------------------
    */

    validateCoinbase(
        coinbase,
        blockHeight
    ) {
        if (
            !coinbase ||
            coinbase.type !==
                "coinbase"
        ) {
            throw new Error(
                "Invalid coinbase transaction."
            );
        }

        if (
            !Array.isArray(
                coinbase.inputs
            ) ||
            coinbase.inputs.length !==
                0
        ) {
            throw new Error(
                "Coinbase transaction must not contain normal inputs."
            );
        }

        if (
            !Array.isArray(
                coinbase.outputs
            ) ||
            coinbase.outputs.length !==
                1
        ) {
            throw new Error(
                "NovaChain MVP coinbase must contain exactly one output."
            );
        }

        const output =
            coinbase.outputs[0];

        const expectedReward =
            getBlockReward(
                blockHeight
            );

        if (
            !Number.isSafeInteger(
                output.amount
            ) ||
            output.amount !==
                expectedReward
        ) {
            throw new Error(
                `Invalid coinbase reward in block #${blockHeight}. Expected ${expectedReward} NNC.`
            );
        }

        if (
            typeof output.address !==
                "string" ||
            output.address.length ===
                0
        ) {
            throw new Error(
                "Coinbase output requires a valid recipient address."
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Persistence
    |--------------------------------------------------------------------------
    */

    async restoreState() {
        if (
            !this.persistenceAvailable
        ) {
            return false;
        }

        try {
            const stored =
                await this.readPersistedState();

            if (
                !stored ||
                !Array.isArray(
                    stored.blocks
                ) ||
                stored.blocks.length ===
                    0
            ) {
                return false;
            }

            /*
             * UTXO snapshot is NOT trusted.
             * Rebuild from the chain.
             */
            await this.validateChain(
                stored.blocks
            );

            this.blockchain.chain =
                stored.blocks;

            this.utxos =
                await this.rebuildUTXOSet(
                    stored.blocks
                );

            this.mempool.clear();

            await this.restoreValidMempool(
                stored.mempool
            );

            await this
                .removeConflictingMempoolTransactions();

            return true;
        } catch (
            error
        ) {
            console.warn(
                "NovaChain persisted state was rejected:",
                error
            );

            /*
             * Preserve the blockchain
             * object's valid genesis.
             */
            await this.blockchain
                .initialize();

            this.utxos = [];

            this.mempool.clear();

            return false;
        }
    }

    async persistState() {
        if (
            !this.persistenceAvailable
        ) {
            return;
        }

        try {
            const chain =
                this.getChain();

            await this.writePersistedState({
                version:
                    DB_VERSION,

                protocolVersion:
                    PROTOCOL.version,

                networkId:
                    PROTOCOL.networkId,

                blocks:
                    chain,

                /*
                 * Cached derived state.
                 *
                 * Restore never trusts it.
                 */
                utxos:
                    this.getUTXOs(),

                mempool:
                    this.getMempoolTransactions(),

                chainWork:
                    chainWorkToString(
                        chain
                    ),

                savedAt:
                    Date.now(),
            });
        } catch (
            error
        ) {
            console.warn(
                "NovaChain local ledger persistence failed:",
                error
            );
        }
    }

    openDatabase() {
        return new Promise(
            (
                resolve,
                reject
            ) => {
                const request =
                    indexedDB.open(
                        DB_NAME,
                        DB_VERSION
                    );

                request.onupgradeneeded =
                    () => {
                        const database =
                            request.result;

                        if (
                            !database
                                .objectStoreNames
                                .contains(
                                    STORE_NAME
                                )
                        ) {
                            database
                                .createObjectStore(
                                    STORE_NAME
                                );
                        }
                    };

                request.onsuccess =
                    () => {
                        resolve(
                            request.result
                        );
                    };

                request.onerror =
                    () => {
                        reject(
                            request.error ??
                                new Error(
                                    "Unable to open NovaChain ledger database."
                                )
                        );
                    };
            }
        );
    }

    async readPersistedState() {
        const database =
            await this.openDatabase();

        return new Promise(
            (
                resolve,
                reject
            ) => {
                const transaction =
                    database.transaction(
                        STORE_NAME,
                        "readonly"
                    );

                const store =
                    transaction.objectStore(
                        STORE_NAME
                    );

                const request =
                    store.get(
                        STATE_KEY
                    );

                request.onsuccess =
                    () => {
                        database.close();

                        resolve(
                            request.result ??
                                null
                        );
                    };

                request.onerror =
                    () => {
                        database.close();

                        reject(
                            request.error ??
                                new Error(
                                    "Unable to read NovaChain ledger."
                                )
                        );
                    };
            }
        );
    }

    async writePersistedState(
        state
    ) {
        const database =
            await this.openDatabase();

        return new Promise(
            (
                resolve,
                reject
            ) => {
                const transaction =
                    database.transaction(
                        STORE_NAME,
                        "readwrite"
                    );

                const store =
                    transaction.objectStore(
                        STORE_NAME
                    );

                store.put(
                    state,
                    STATE_KEY
                );

                transaction.oncomplete =
                    () => {
                        database.close();

                        resolve();
                    };

                transaction.onerror =
                    () => {
                        database.close();

                        reject(
                            transaction.error ??
                                new Error(
                                    "Unable to persist NovaChain ledger."
                                )
                        );
                    };

                transaction.onabort =
                    () => {
                        database.close();

                        reject(
                            transaction.error ??
                                new Error(
                                    "NovaChain ledger persistence was aborted."
                                )
                        );
                    };
            }
        );
    }

    queueRemoteTransaction(
        transaction
    ) {
        if (
            !transaction?.id
        ) {
            return;
        }

        if (
            this.pendingRemoteTransactions.some(
                (candidate) =>
                    candidate?.id ===
                    transaction.id
            )
        ) {
            return;
        }

        this.pendingRemoteTransactions.push(
            transaction
        );

        if (
            this.pendingRemoteTransactions
                .length >
            50
        ) {
            this.pendingRemoteTransactions.shift();
        }
    }

    requireInitialized() {
        if (
            !this.initialized
        ) {
            throw new Error(
                "Network state is not initialized."
            );
        }
    }
}

export const networkState =
    new NetworkState();

export {
    PROTOCOL,
    calculateBlockWork,
};