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
| Local authoritative state:
|
| Wallet
|   ↓
| Transaction
|   ↓
| Mempool
|   ↓
| Mining
|   ↓
| Blockchain
|   ↓
| Derived UTXO set
|
| Networking only transports:
|   transaction
|   block
|   state-request
|   state-response
|
| The relay never owns the ledger.
|--------------------------------------------------------------------------
*/

const MINING_REWARD = 50_000;

const DB_NAME = "novachain-ledger";
const DB_VERSION = 1;
const STORE_NAME = "network";

const STATE_KEY = "local-state";

export class NetworkState {
    constructor() {
        this.blockchain = new Blockchain();
        this.mempool = new Mempool();

        this.utxos = [];

        this.initialized = false;
        this.isMining = false;

        /*
         * Live NCCP transport.
         *
         * The transport is only a message pipe.
         * It does not become the source of truth.
         */
        this.networkTransport = null;

        /*
         * Transactions that arrive before the local chain
         * has caught up with the transaction's referenced UTXOs.
         */
        this.pendingRemoteTransactions = [];

        this.persistenceAvailable =
            typeof indexedDB !== "undefined";
    }

    /*
    |--------------------------------------------------------------------------
    | Initialization
    |--------------------------------------------------------------------------
    */

    async initialize() {
        if (this.initialized) {
            return this;
        }

        await this.blockchain.initialize();

        const restored =
            await this.restoreState();

        if (!restored) {
            this.utxos = [];

            await this.persistState();
        }

        this.initialized = true;

        return this;
    }

    attachNetworkTransport(transport) {
        this.networkTransport =
            transport ?? null;

        return this;
    }

    getNetworkStatus() {
        const status =
            this.networkTransport?.statusSnapshot;

        return {
            connected:
                Boolean(
                    this.networkTransport?.connected
                ),

            status:
                status?.status ??
                (
                    this.networkTransport?.connected
                        ? "ONLINE"
                        : "OFFLINE"
                ),

            peerCount:
                Number(status?.peerCount ?? 0),
            directPeerCount:
                Number(status?.directPeerCount ?? 0),
            totalNodeCount:
                Number(status?.totalNodeCount ?? (status?.connected ? Number(status?.peerCount ?? 0) + 1 : 0)),
            peers: status?.peers ?? [],

            signalingUrl:
                status?.url ?? null,
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Local accessors
    |--------------------------------------------------------------------------
    */

    getLatestBlock() {
        return this.blockchain.getLatestBlock();
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
        return this.mempool.getTransactions();
    }

    getBalance(address) {
        return getBalance(
            this.utxos,
            address
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Spendable UTXOs
    |--------------------------------------------------------------------------
    |
    | A UTXO already referenced by a pending local transaction
    | must not be selected again.
    |--------------------------------------------------------------------------
    */

    getSpendableUTXOs(address) {
        const pendingInputs =
            new Set();

        for (
            const transaction
            of this.mempool.getTransactions()
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
                utxo.address === address &&
                !pendingInputs.has(
                    `${utxo.transactionId}:${utxo.outputIndex}`
                )
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Payment creation
    |--------------------------------------------------------------------------
    */

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
            typeof recipientAddress !== "string" ||
            recipientAddress.trim().length === 0
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
         * Only select UTXOs that are not already
         * committed to another pending transaction.
         */
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

        /*
         * Create transaction inputs.
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
         * Recipient output.
         */
        const outputs = [
            {
                address:
                    recipientAddress.trim(),

                amount,
            },
        ];

        /*
         * Sender change output.
         */
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

        /*
         * Sign using the sender wallet.
         */
        await signTransaction(
            transaction,
            wallet.privateKey,
            wallet.publicKey
        );

        /*
         * Validate before entering mempool.
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
         * Final race-condition protection:
         * make sure another pending transaction did not
         * claim one of these UTXOs while we were signing.
         */
        const pendingInputs =
            new Set();

        for (
            const pending
            of this.mempool.getTransactions()
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
                pendingInputs.has(key)
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
         * Send the signed transaction to peers.
         */
        this.networkTransport?.broadcastTransaction(
            transaction
        );

        return transaction;
    }

    /*
    |--------------------------------------------------------------------------
    | Mining
    |--------------------------------------------------------------------------
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
            typeof minerAddress !== "string" ||
            minerAddress.trim().length === 0
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
            const pendingTransactions =
                this.mempool.getTransactions();

            const currentHeight =
                this.getLatestBlock()?.index ?? 0;

            /*
             * Bootstrap rule:
             *
             * Height 0 → allow one coinbase-only block.
             *
             * Height > 0 → require real pending work.
             *
             * This prevents infinite empty reward mining while
             * still giving a brand-new network a way to acquire
             * its first coins.
             */
            if (
                currentHeight > 0 &&
                pendingTransactions.length === 0
            ) {
                throw new Error(
                    "No pending blockchain work. Submit a transaction before mining another block."
                );
            }

            /*
             * Create the miner reward transaction.
             */
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

            /*
             * Coinbase must be the first transaction.
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
             * Proof of Work.
             */
            await mineBlock(
                block,
                {
                    onProgress,
                    signal,
                }
            );

            /*
             * Block-level validation and append.
             */
            const validBlock =
                await this.blockchain.addBlock(
                    block
                );

            /*
             * Update local UTXO state only after
             * the block has been accepted.
             */
            this.utxos =
                applyTransactionsToUTXOSet(
                    this.utxos,
                    transactions
                );

            /*
             * Confirmed transactions are no longer pending.
             */
            this.mempool.removeTransactions(
                pendingTransactions
            );

            await this.persistState();

            /*
             * Broadcast the accepted block.
             */
            this.networkTransport?.broadcastBlock(
                validBlock
            );

            return validBlock;
        } finally {
            this.isMining = false;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | External block reception
    |--------------------------------------------------------------------------
    */

    async addExternalBlock(block) {
        this.requireInitialized();

        if (
            !block ||
            typeof block !== "object"
        ) {
            return false;
        }

        const latest =
            this.getLatestBlock();

        if (!latest) {
            return false;
        }

        /*
         * Ignore blocks that are already known.
         */
        if (
            block.index <= latest.index
        ) {
            return false;
        }

        /*
         * Normal fast path:
         * exactly the next block in our chain.
         *
         * A gap means synchronization is required.
         */
        if (
            block.index !==
                latest.index + 1 ||
            block.previousHash !==
                latest.hash
        ) {
            this.networkTransport?.requestState();

            return false;
        }

        /*
         * Validate each transaction against the
         * current local UTXO state.
         */
        let workingUTXOs =
            [
                ...this.utxos,
            ];

        for (
            const transaction
            of block.transactions ?? []
        ) {
            const validTransaction =
                await validateTransaction(
                    transaction,
                    workingUTXOs
                );

            if (!validTransaction) {
                /*
                 * Local chain may be behind.
                 * Request a newer state instead of
                 * applying potentially invalid state.
                 */
                this.networkTransport?.requestState();

                return false;
            }

            workingUTXOs =
                applyTransactionsToUTXOSet(
                    workingUTXOs,
                    [
                        transaction,
                    ]
                );
        }

        /*
         * Now validate and append the block itself.
         */
        const validBlock =
            await this.blockchain.addBlock(
                block
            );

        /*
         * The working UTXO set is exactly the state that
         * follows the newly accepted block.
         */
        this.utxos =
            workingUTXOs;

        /*
         * Remove confirmed normal transactions
         * from the local mempool.
         */
        const regularTransactions =
            (
                block.transactions ?? []
            ).filter(
                (transaction) =>
                    transaction.type !==
                    "coinbase"
            );

        this.mempool.removeTransactions(
            regularTransactions
        );

        await this.persistState();

        /*
         * A newly arrived block may make queued
         * transactions valid now.
         */
        await this.retryPendingRemoteTransactions();

        return validBlock;
    }

    /*
    |--------------------------------------------------------------------------
    | Remote transaction reception
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

        /*
         * If the receiver already knows the referenced
         * UTXO, validate immediately.
         */
        const valid =
            await validateTransaction(
                transaction,
                this.utxos
            );

        if (!valid) {
            /*
             * The transaction may be arriving before the
             * chain state it depends on.
             *
             * Queue it and request synchronization.
             */
            if (
                !this.pendingRemoteTransactions.some(
                    (queued) =>
                        queued?.id ===
                        transaction.id
                )
            ) {
                this.pendingRemoteTransactions.push(
                    transaction
                );
            }

            this.networkTransport?.requestState();

            return false;
        }

        /*
         * Valid transaction becomes local pending work.
         */
        this.mempool.add(
            transaction
        );

        await this.persistState();

        return true;
    }

    /*
    |--------------------------------------------------------------------------
    | Remote state adoption
    |--------------------------------------------------------------------------
    |
    | A peer's UTXO snapshot is NOT treated as canonical.
    |
    | We validate the supplied blockchain and rebuild UTXOs
    | locally from that blockchain.
    |--------------------------------------------------------------------------
    */

    async adoptRemoteState(
        state
    ) {
        this.requireInitialized();

        if (
            !state ||
            !Array.isArray(state.blocks) ||
            state.blocks.length === 0
        ) {
            return false;
        }

        const remoteHeight =
            state.blocks.length - 1;

        const localHeight =
            this.blockchain.chain.length - 1;

        if (
            remoteHeight <= localHeight
        ) {
            return false;
        }

        const previousChain =
            this.blockchain.chain;

        const previousUTXOs =
            this.utxos;

        const previousMempool =
            this.mempool.getTransactions();

        try {
            /*
             * Tentatively adopt the remote chain.
             */
            this.blockchain.chain =
                state.blocks.map(
                    (block) => ({
                        ...block,
                    })
                );

            /*
             * Validate complete chain.
             */
            const chainValid =
                await this.blockchain.isValid();

            if (!chainValid) {
                throw new Error(
                    "Remote blockchain failed validation."
                );
            }

            /*
             * Rebuild UTXOs from genesis onward.
             *
             * This means the peer cannot simply lie about
             * a balance snapshot.
             */
            let rebuiltUTXOs =
                [];

            for (
                const block
                of this.blockchain.chain
            ) {
                for (
                    const transaction
                    of block.transactions ?? []
                ) {
                    const validTransaction =
                        await validateTransaction(
                            transaction,
                            rebuiltUTXOs
                        );

                    if (!validTransaction) {
                        throw new Error(
                            `Invalid transaction ${transaction?.id ?? "unknown"} in block #${block.index}.`
                        );
                    }

                    rebuiltUTXOs =
                        applyTransactionsToUTXOSet(
                            rebuiltUTXOs,
                            [
                                transaction,
                            ]
                        );
                }
            }

            this.utxos =
                rebuiltUTXOs;

            /*
             * Rebuild the mempool using the new chain state.
             */
            this.mempool.clear();

            const remoteMempool =
                Array.isArray(
                    state.mempool
                )
                    ? state.mempool
                    : [];

            for (
                const transaction
                of remoteMempool
            ) {
                if (
                    !transaction?.id
                ) {
                    continue;
                }

                const valid =
                    await validateTransaction(
                        transaction,
                        this.utxos
                    );

                if (valid) {
                    this.mempool.add(
                        transaction
                    );
                }
            }

            await this.persistState();

            await this.retryPendingRemoteTransactions();

            return true;
        } catch (error) {
            /*
             * Roll back completely on synchronization failure.
             */
            this.blockchain.chain =
                previousChain;

            this.utxos =
                previousUTXOs;

            this.mempool.clear();

            for (
                const transaction
                of previousMempool
            ) {
                if (
                    transaction?.id
                ) {
                    this.mempool.add(
                        transaction
                    );
                }
            }

            console.warn(
                "NovaChain remote state adoption failed.",
                error
            );

            return false;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Retry queued remote transactions
    |--------------------------------------------------------------------------
    */

    async retryPendingRemoteTransactions() {
        if (
            !this.pendingRemoteTransactions.length
        ) {
            return;
        }

        const queued =
            [
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

    /*
    |--------------------------------------------------------------------------
    | Snapshot
    |--------------------------------------------------------------------------
    */

    getStateSnapshot() {
        return {
            initialized:
                this.initialized,

            chainHeight:
                this.blockchain.chain.length - 1,

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
        if (!this.initialized) {
            throw new Error(
                "Network state is not initialized."
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
                stored.blocks.length === 0
            ) {
                return false;
            }

            const previousChain =
                this.blockchain.chain;

            /*
             * Temporarily load persisted chain.
             */
            this.blockchain.chain =
                stored.blocks.map(
                    (block) => ({
                        ...block,
                    })
                );

            /*
             * Validate persisted chain.
             */
            const chainValid =
                await this.blockchain.isValid();

            if (!chainValid) {
                this.blockchain.chain =
                    previousChain;

                return false;
            }

            /*
             * Rebuild UTXOs from the chain instead of trusting
             * the persisted UTXO snapshot.
             */
            let rebuiltUTXOs =
                [];

            for (
                const block
                of this.blockchain.chain
            ) {
                for (
                    const transaction
                    of block.transactions ?? []
                ) {
                    const validTransaction =
                        await validateTransaction(
                            transaction,
                            rebuiltUTXOs
                        );

                    if (!validTransaction) {
                        throw new Error(
                            `Invalid persisted transaction ${transaction?.id ?? "unknown"} in block #${block.index}.`
                        );
                    }

                    rebuiltUTXOs =
                        applyTransactionsToUTXOSet(
                            rebuiltUTXOs,
                            [
                                transaction,
                            ]
                        );
                }
            }

            this.utxos =
                rebuiltUTXOs;

            /*
             * Restore only mempool transactions that are
             * still valid against the rebuilt UTXO state.
             */
            this.mempool.clear();

            for (
                const transaction
                of stored.mempool ?? []
            ) {
                if (
                    !transaction?.id
                ) {
                    continue;
                }

                const valid =
                    await validateTransaction(
                        transaction,
                        this.utxos
                    );

                if (valid) {
                    this.mempool.add(
                        transaction
                    );
                }
            }

            return true;
        } catch (error) {
            console.warn(
                "NovaChain persisted state was rejected. Starting from genesis.",
                error
            );

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
            await this.writePersistedState({
                version: 1,

                blocks:
                    this.getChain(),

                /*
                 * Kept for debugging/inspection,
                 * but restore never trusts this snapshot.
                 */
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
                            !database.objectStoreNames.contains(
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
}

export const networkState =
    new NetworkState();