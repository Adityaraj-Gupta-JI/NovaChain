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

/*
|--------------------------------------------------------------------------
| NovaChain Network State
|--------------------------------------------------------------------------
|
| Coordinates:
|
| Wallet
|   ↓
| Transaction
|   ↓
| Mempool
|   ↓
| Mining
|   ↓
| Block
|   ↓
| UTXO Set
|
| Network transport is attached separately.
| The relay carries NCCP messages only.
|--------------------------------------------------------------------------
*/

const MINING_REWARD = 50_000;

const DB_NAME = "novachain-ledger";
const DB_VERSION = 1;
const STORE_NAME = "network";

const STATE_KEY = "local-state";

export class NetworkState {
    constructor() {
        this.blockchain =
            new Blockchain();

        this.mempool =
            new Mempool();

        this.utxos = [];

        this.initialized = false;
        this.isMining = false;

        /*
         * Live NCCP transport.
         *
         * The transport is responsible for
         * moving messages between browser nodes.
         *
         * It does NOT own ledger state.
         */
        this.networkTransport =
            null;

        /*
         * Remote transactions that arrived
         * before the node had the UTXOs required
         * to validate them.
         */
        this.pendingRemoteTransactions =
            [];

        this.persistenceAvailable =
            typeof indexedDB !==
            "undefined";
    }

    async initialize() {
        if (this.initialized) {
            return this;
        }

        await this.blockchain.initialize();

        const restored =
            await this.restoreState();

        if (!restored) {
            await this.persistState();
        }

        this.initialized = true;

        return this;
    }

    /*
     * Attach the browser network transport.
     */
    attachNetworkTransport(
        transport
    ) {
        this.networkTransport =
            transport ??
            null;

        return this;
    }

    /*
     * Current network status for UI/debugging.
     */
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

    getBalance(address) {
        return getBalance(
            this.utxos,
            address
        );
    }

    /*
     * Return only UTXOs that have not
     * already been consumed by pending
     * mempool transactions.
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
                of transaction.inputs ?? []
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

    async createPayment({
        wallet,
        recipientAddress,
        amount,
    }) {
        this.requireInitialized();

        if (!wallet?.address) {
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
                    recipientAddress.trim(),

                amount,
            },
        ];

        if (change > 0) {
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

        if (!valid) {
            throw new Error(
                "Transaction validation failed."
            );
        }

        /*
         * Final mempool double-spend check.
         */
        const pendingInputs =
            new Set();

        for (
            const pending
            of this.mempool
                .getTransactions()
        ) {
            for (
                const input
                of pending.inputs ?? []
            ) {
                pendingInputs.add(
                    `${input.transactionId}:${input.outputIndex}`
                );
            }
        }

        for (
            const input
            of transaction.inputs
        ) {
            const key =
                `${input.transactionId}:${input.outputIndex}`;

            if (
                pendingInputs.has(
                    key
                )
            ) {
                throw new Error(
                    "One or more selected UTXOs are already pending in the mempool."
                );
            }
        }

        this.mempool.add(
            transaction
        );

        await this.persistState();

        /*
         * THIS is the new network step.
         *
         * Browser A:
         *
         * local mempool
         *      +
         * NCCP broadcast
         *
         * Other nodes receive the transaction.
         */
        this.networkTransport
            ?.broadcastTransaction(
                transaction
            );

        return transaction;
    }    /*
     * Mine a new block.
     *
     * Empty mempool is allowed.
     *
     * A miner can therefore create:
     *
     *   coinbase-only block
     *
     * and receive the protocol reward.
     */
    async minePendingTransactions({
        minerAddress,
        difficulty = 3,
        onProgress,
        signal,
    }) {
        this.requireInitialized();

        if (this.isMining) {
            throw new Error(
                "Mining is already in progress."
            );
        }

        if (
            typeof minerAddress !==
                "string" ||
            minerAddress
                .trim()
                .length === 0
        ) {
            throw new Error(
                "A valid miner address is required."
            );
        }

        if (
            !Number.isInteger(
                difficulty
            ) ||
            difficulty < 0 ||
            difficulty > 64
        ) {
            throw new Error(
                "Invalid mining difficulty."
            );
        }

        this.isMining = true;

        try {
            const pendingTransactions =
                this.mempool
                    .getTransactions();

            const coinbase =
                createCoinbaseTransaction({
                    minerAddress:
                        minerAddress.trim(),

                    reward:
                        MINING_REWARD,
                });

            await finalizeCoinbaseTransaction(
                coinbase
            );

            const transactions = [
                coinbase,
                ...pendingTransactions,
            ];

            const latestBlock =
                this.getLatestBlock();

            const block =
                await createBlock({
                    index:
                        latestBlock.index +
                        1,

                    previousHash:
                        latestBlock.hash,

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

            const validBlock =
                await this.blockchain
                    .addBlock(
                        block
                    );

            this.utxos =
                applyTransactionsToUTXOSet(
                    this.utxos,
                    transactions
                );

            this.mempool
                .removeTransactions(
                    pendingTransactions
                );

            await this.persistState();

            /*
             * NEW NETWORK STEP:
             *
             * Once the local block is fully
             * validated and committed,
             * broadcast it to the other nodes.
             */
            this.networkTransport
                ?.broadcastBlock(
                    validBlock
                );

            return validBlock;
        } finally {
            this.isMining = false;
        }
    }

    /*
     * Add a block received from another node.
     */
    async addExternalBlock(
        block
    ) {
        this.requireInitialized();

        if (!block) {
            return false;
        }

        const latest =
            this.getLatestBlock();

        /*
         * Already have this block.
         */
        if (
            block.index <=
            latest.index
        ) {
            return false;
        }

        /*
         * We only directly accept the exact
         * next block in the current MVP.
         *
         * If there is a gap, request the
         * longer state from peers.
         */
        if (
            block.index !==
                latest.index + 1 ||
            block.previousHash !==
                latest.hash
        ) {
            this.networkTransport
                ?.requestState();

            return false;
        }

        let validBlock;

        try {
            validBlock =
                await this.blockchain
                    .addBlock(
                        block
                    );
        } catch (error) {
            /*
             * Do not let malformed/foreign
             * network data break the node.
             */
            console.warn(
                "NovaChain rejected external block.",
                error
            );

            return false;
        }

        try {
            this.utxos =
                applyTransactionsToUTXOSet(
                    this.utxos,
                    block.transactions
                );
        } catch (error) {
            console.error(
                "NovaChain failed to apply external block UTXOs.",
                error
            );

            return false;
        }

        const regularTransactions =
            block.transactions.filter(
                (transaction) =>
                    transaction.type !==
                    "coinbase"
            );

        this.mempool
            .removeTransactions(
                regularTransactions
            );

        await this.persistState();

        /*
         * A block received from a peer
         * is NOT rebroadcast here.
         *
         * The relay already propagated it.
         */
        return validBlock;
    }

    /*
     * Receive a payment transaction from
     * another browser node.
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

        /*
         * Ignore transactions we
         * already know.
         */
        if (
            this.mempool.has(
                transaction.id
            )
        ) {
            return false;
        }

        /*
         * Validate against our local UTXO set.
         */
        const valid =
            await validateTransaction(
                transaction,
                this.utxos
            );

        if (!valid) {
            /*
             * The sender may have a longer chain
             * than this node.
             *
             * Ask peers for current state.
             */
            const exists =
                this.pendingRemoteTransactions
                    .some(
                        (pending) =>
                            pending.id ===
                            transaction.id
                    );

            if (!exists) {
                this.pendingRemoteTransactions
                    .push(
                        transaction
                    );
            }

            this.networkTransport
                ?.requestState();

            return false;
        }

        /*
         * Extra pending-spend protection.
         */
        const pendingInputs =
            new Set();

        for (
            const pending
            of this.mempool
                .getTransactions()
        ) {
            for (
                const input
                of pending.inputs ?? []
            ) {
                pendingInputs.add(
                    `${input.transactionId}:${input.outputIndex}`
                );
            }
        }

        for (
            const input
            of transaction.inputs ?? []
        ) {
            const key =
                `${input.transactionId}:${input.outputIndex}`;

            if (
                pendingInputs.has(
                    key
                )
            ) {
                return false;
            }
        }

        this.mempool.add(
            transaction
        );

        await this.persistState();

        /*
         * IMPORTANT:
         *
         * We intentionally DO NOT broadcast
         * the transaction again.
         *
         * The relay already forwards it to
         * every current peer.
         *
         * This prevents a broadcast loop.
         */
        return true;
    }

    /*
     * Adopt a newer peer state.
     *
     * Current MVP synchronization trusts
     * the peer's UTXO snapshot after the
     * blockchain itself is validated.
     *
     * Later we can deterministically
     * rebuild UTXOs from the chain.
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
            !state.blocks.length
        ) {
            return false;
        }

        const remoteHeight =
            state.blocks.length - 1;

        const localHeight =
            this.blockchain
                .chain.length - 1;

        /*
         * Never replace an equal/shorter chain.
         */
        if (
            remoteHeight <=
            localHeight
        ) {
            return false;
        }

        const previousChain =
            this.blockchain.chain;

        this.blockchain.chain = [
            ...state.blocks,
        ];

        try {
            const chainValid =
                await this.blockchain
                    .isValid();

            if (!chainValid) {
                this.blockchain.chain =
                    previousChain;

                return false;
            }

            if (
                !Array.isArray(
                    state.utxos
                )
            ) {
                this.blockchain.chain =
                    previousChain;

                return false;
            }

            /*
             * Replace local state with
             * the validated longer chain.
             */
            this.utxos = [
                ...state.utxos,
            ];

            this.mempool.clear();

            if (
                Array.isArray(
                    state.mempool
                )
            ) {
                for (
                    const transaction
                    of state.mempool
                ) {
                    if (
                        transaction?.id
                    ) {
                        this.mempool.add(
                            transaction
                        );
                    }
                }
            }

            await this.persistState();

            await this.retryPendingRemoteTransactions();

            return true;
        } catch (error) {
            this.blockchain.chain =
                previousChain;

            console.warn(
                "NovaChain remote state adoption failed.",
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
                await this.receiveRemoteTransaction(
                    transaction
                );
            } catch (error) {
                console.warn(
                    "NovaChain queued transaction could not be applied.",
                    error
                );
            }
        }
    }

    clearMempool() {
        this.mempool.clear();

        void this.persistState();
    }

    getStateSnapshot() {
        return {
            initialized:
                this.initialized,

            chainHeight:
                this.blockchain
                    .chain.length - 1,

            blocks:
                this.getChain(),

            utxos:
                this.getUTXOs(),

            mempool:
                this.getMempoolTransactions(),

            isMining:
                this.isMining,

            network:
                this.getNetworkStatus(),
        };
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

    async restoreState() {
        if (
            !this.persistenceAvailable
        ) {
            return false;
        }

        try {
            const stored =
                await this.readPersistedState();

            if (!stored) {
                return false;
            }

            if (
                !Array.isArray(
                    stored.blocks
                ) ||
                stored.blocks.length === 0 ||
                !Array.isArray(
                    stored.utxos
                ) ||
                !Array.isArray(
                    stored.mempool
                )
            ) {
                return false;
            }

            const previousChain =
                this.blockchain.chain;

            this.blockchain.chain =
                stored.blocks;

            const chainValid =
                await this.blockchain
                    .isValid();

            if (!chainValid) {
                this.blockchain.chain =
                    previousChain;

                return false;
            }

            this.utxos = [
                ...stored.utxos,
            ];

            this.mempool.clear();

            for (
                const transaction
                of stored.mempool
            ) {
                if (
                    transaction?.id
                ) {
                    this.mempool.add(
                        transaction
                    );
                }
            }

            return true;
        } catch (error) {
            console.warn(
                "NovaChain local ledger restore failed. Starting from genesis.",
                error
            );

            return false;
        }
    }    async persistState() {
        if (
            !this.persistenceAvailable
        ) {
            return;
        }

        try {
            await this.writePersistedState({
                version: 1,

                blocks:
                    this.getChain(),

                utxos:
                    this.getUTXOs(),

                mempool:
                    this.getMempoolTransactions(),

                savedAt:
                    Date.now(),
            });
        } catch (error) {
            console.warn(
                "NovaChain local ledger persistence failed.",
                error
            );
        }
    }

    openDatabase() {
        return new Promise(
            (resolve, reject) => {
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
                            database.createObjectStore(
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
            (resolve, reject) => {
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
            (resolve, reject) => {
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
}

export const networkState =
    new NetworkState();