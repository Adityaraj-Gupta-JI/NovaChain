import { APP_CONFIG } from "./app/config.js";
import { getState } from "./app/store.js";
import "./styles/globals.css";

// ============================================================
// NOVACHAIN CORE IMPORTS
// ============================================================

import { getNodeIdentity } from "./core/identity/nodeIdentity.js";

import { createWallet } from "./core/wallet/wallet.js";

import {
    createTransaction,
    signTransaction,
    createCoinbaseTransaction,
    finalizeCoinbaseTransaction,
} from "./core/transaction/transaction.js";

import {
    verifyTransactionSignature,
} from "./core/transaction/validator.js";

import {
    createUTXO,
    getBalance,
    selectUTXOs,
} from "./core/transaction/utxo.js";

import { Blockchain } from "./core/block/blockchain.js";

import {
    createBlock,
    calculateBlockHash,
} from "./core/block/block.js";

import {
    calculateMerkleRoot,
} from "./core/block/merkle.js";

import { Mempool } from "./core/mempool/mempool.js";

// IMPORTANT:
// Actual filename in the project tree is:
// src/core/mining/proofofWork.js
import { mineBlock } from "./core/mining/proofofWork.js";


// ============================================================
// NOVACHAIN RUNTIME STATE
// ============================================================

const nodeIdentity = getNodeIdentity();

const wallet = await createWallet();

console.log("");
console.log("========================================");
console.log("          NOVACHAIN STARTUP");
console.log("========================================");

console.log(
    "Node Identity:",
    nodeIdentity
);

console.log(
    "Wallet Address:",
    wallet.address
);


// ============================================================
// TEST BLOCK 1 — WALLET + UTXO
// ============================================================

console.log("");
console.log("========== TEST BLOCK 1: UTXO ==========");

// Temporary test UTXO.
//
// IMPORTANT:
// This is NOT persistent blockchain state.
// It exists only until the real UTXO ledger is implemented.
//
// It will eventually be removed.

const genesisUTXO = createUTXO({
    transactionId: "genesis-test",
    outputIndex: 0,
    address: wallet.address,
    amount: 10_000_000,
});

const utxos = [
    genesisUTXO,
];

console.log(
    "Initial balance:",
    getBalance(
        utxos,
        wallet.address
    ),
    "NNC"
);

const paymentAmount = 3_000_000;

const selection = selectUTXOs(
    utxos,
    wallet.address,
    paymentAmount
);

console.log(
    "Selected UTXOs:",
    selection.selected
);

console.log(
    "Selected total:",
    selection.total
);

console.log(
    "Change:",
    selection.change
);

console.log(
    "TEST BLOCK 1 COMPLETE"
);


// ============================================================
// TEST BLOCK 2 — TRANSACTION CREATION
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 2: TRANSACTION =========="
);

const transaction =
    createTransaction({
        inputs:
            selection.selected.map(
                (utxo) => ({
                    transactionId:
                        utxo.transactionId,

                    outputIndex:
                        utxo.outputIndex,
                })
            ),

        outputs: [
            {
                address:
                    "NVCrecipient123",

                amount:
                    paymentAmount,
            },

            {
                address:
                    wallet.address,

                amount:
                    selection.change,
            },
        ],
    });

console.log(
    "Unsigned transaction:",
    transaction
);

console.log(
    "TEST BLOCK 2 COMPLETE"
);


// ============================================================
// TEST BLOCK 3 — TRANSACTION SIGNATURE
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 3: SIGNATURE =========="
);

await signTransaction(
    transaction,
    wallet.privateKey,
    wallet.publicKey
);

console.log(
    "Signed transaction:",
    transaction
);

console.log(
    "Transaction ID:",
    transaction.id
);

const valid =
    await verifyTransactionSignature(
        transaction
    );

console.log(
    "Transaction signature valid:",
    valid
);

console.log(
    "TEST BLOCK 3 COMPLETE"
);


// ============================================================
// TEST BLOCK 4 — TRANSACTION TAMPERING
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 4: TAMPERING =========="
);

// Save original value before intentional mutation.

const originalPaymentAmount =
    transaction.outputs[0].amount;

// Intentionally modify the transaction
// after signing.
//
// The signature should become invalid.

transaction.outputs[0].amount =
    9_000_000;

const tamperedValid =
    await verifyTransactionSignature(
        transaction
    );

console.log(
    "Tampered transaction valid:",
    tamperedValid
);

console.log(
    "Expected result:",
    false
);

// Restore transaction.

transaction.outputs[0].amount =
    originalPaymentAmount;

console.log(
    "Transaction restored."
);

console.log(
    "Transaction valid after restoration:",
    await verifyTransactionSignature(
        transaction
    )
);

console.log(
    "TEST BLOCK 4 COMPLETE"
);


// ============================================================
// TEST BLOCK 5 — BLOCKCHAIN INITIALIZATION
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 5: BLOCKCHAIN =========="
);

const blockchain =
    new Blockchain();

await blockchain.initialize();

const genesisBlock =
    blockchain.getLatestBlock();

console.log(
    "Genesis block:",
    genesisBlock
);

console.log(
    "Initial chain length:",
    blockchain.chain.length
);

console.log(
    "Initial blockchain valid:",
    await blockchain.isValid()
);

console.log(
    "TEST BLOCK 5 COMPLETE"
);


// ============================================================
// TEST BLOCK 6 — MEMPOOL
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 6: MEMPOOL =========="
);

const mempool =
    new Mempool();

console.log(
    "Initial mempool size:",
    mempool.size
);

try {
    mempool.add(
        transaction
    );

    console.log(
        "Transaction added to mempool:",
        transaction.id
    );
} catch (error) {
    console.error(
        "Mempool transaction error:",
        error
    );
}

console.log(
    "Mempool size:",
    mempool.size
);

console.log(
    "Mempool transactions:",
    mempool.getTransactions()
);

console.log(
    "Mempool contains transaction:",
    mempool.has(
        transaction.id
    )
);

console.log(
    "TEST BLOCK 6 COMPLETE"
);


// ============================================================
// TEST BLOCK 7 — COINBASE TRANSACTION
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 7: COINBASE =========="
);

const miningReward =
    50_000;

const coinbaseTransaction =
    createCoinbaseTransaction({
        minerAddress:
            wallet.address,

        reward:
            miningReward,
    });

await finalizeCoinbaseTransaction(
    coinbaseTransaction
);

console.log(
    "Coinbase transaction:",
    coinbaseTransaction
);

console.log(
    "Coinbase ID:",
    coinbaseTransaction.id
);

console.log(
    "Coinbase type:",
    coinbaseTransaction.type
);

console.log(
    "Coinbase inputs:",
    coinbaseTransaction.inputs
);

console.log(
    "Miner address:",
    coinbaseTransaction.outputs[0].address
);

console.log(
    "Mining reward:",
    coinbaseTransaction.outputs[0].amount,
    "NNC"
);

console.log(
    "TEST BLOCK 7 COMPLETE"
);


// ============================================================
// TEST BLOCK 8 — MEMPOOL DUPLICATE PROTECTION
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 8: MEMPOOL DUPLICATE =========="
);

let duplicateRejected =
    false;

try {
    mempool.add(
        transaction
    );
} catch (error) {
    duplicateRejected = true;

    console.log(
        "Duplicate transaction rejected:",
        error.message
    );
}

console.log(
    "Duplicate rejected:",
    duplicateRejected
);

console.log(
    "Mempool size after duplicate attempt:",
    mempool.size
);

console.log(
    "TEST BLOCK 8 COMPLETE"
);


// ============================================================
// TEST BLOCK 9 — BLOCK ASSEMBLY
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 9: BLOCK ASSEMBLY =========="
);

// Build the next block from:
// 1. Coinbase transaction
// 2. Pending mempool transaction

const pendingTransactions =
    mempool.getTransactions();

const miningBlock =
    await createBlock({
        index:
            blockchain.chain.length,

        previousHash:
            blockchain.getLatestBlock().hash,

        transactions: [
            coinbaseTransaction,
            ...pendingTransactions,
        ],

        difficulty: 3,
    });

console.log(
    "Block assembled:",
    miningBlock
);

console.log(
    "Block index:",
    miningBlock.index
);

console.log(
    "Previous hash:",
    miningBlock.previousHash
);

console.log(
    "Transaction count:",
    miningBlock.transactions.length
);

console.log(
    "Merkle root:",
    miningBlock.merkleRoot
);

console.log(
    "Difficulty:",
    miningBlock.difficulty
);

console.log(
    "Initial nonce:",
    miningBlock.nonce
);

console.log(
    "Initial hash:",
    miningBlock.hash
);

console.log(
    "TEST BLOCK 9 COMPLETE"
);


// ============================================================
// TEST BLOCK 10 — PROOF OF WORK MINING
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 10: PROOF OF WORK =========="
);

console.log(
    "Starting mining..."
);

console.log(
    "Difficulty:",
    miningBlock.difficulty
);

console.log(
    "Target:",
    "0".repeat(
        miningBlock.difficulty
    )
);

const miningStart =
    performance.now();

let lastReportedNonce = 0;

const minedBlock =
    await mineBlock(
        miningBlock,
        {
            onProgress: ({
                nonce,
                hash,
            }) => {
                // Avoid flooding the console.
                if (
                    nonce >=
                    lastReportedNonce + 1000
                ) {
                    lastReportedNonce =
                        nonce;

                    console.log(
                        "Mining progress:",
                        {
                            nonce,
                            hash,
                        }
                    );
                }
            },
        }
    );

const miningEnd =
    performance.now();

console.log(
    "Mining complete."
);

console.log(
    "Winning nonce:",
    minedBlock.nonce
);

console.log(
    "Winning hash:",
    minedBlock.hash
);

console.log(
    "Hash satisfies difficulty:",
    minedBlock.hash.startsWith(
        "0".repeat(
            minedBlock.difficulty
        )
    )
);

console.log(
    "Mining duration:",
    (
        miningEnd -
        miningStart
    ).toFixed(2),
    "ms"
);

console.log(
    "TEST BLOCK 10 COMPLETE"
);


// ============================================================
// TEST BLOCK 11 — MINED BLOCK VALIDATION
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 11: MINED BLOCK VALIDATION =========="
);

const recalculatedMiningHash =
    await calculateBlockHash(
        minedBlock
    );

console.log(
    "Stored block hash:",
    minedBlock.hash
);

console.log(
    "Recalculated block hash:",
    recalculatedMiningHash
);

console.log(
    "Hash matches:",
    minedBlock.hash ===
        recalculatedMiningHash
);

console.log(
    "PoW valid:",
    minedBlock.hash.startsWith(
        "0".repeat(
            minedBlock.difficulty
        )
    )
);

console.log(
    "TEST BLOCK 11 COMPLETE"
);


// ============================================================
// TEST BLOCK 12 — ADD MINED BLOCK
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 12: ADD MINED BLOCK =========="
);

try {
    await blockchain.addBlock(
        minedBlock
    );

    console.log(
        "Mined block accepted by blockchain."
    );
} catch (error) {
    console.error(
        "Mined block rejected:",
        error
    );

    throw error;
}

console.log(
    "Latest block:",
    blockchain.getLatestBlock()
);

console.log(
    "Blockchain height:",
    blockchain.chain.length - 1
);

console.log(
    "Blockchain valid:",
    await blockchain.isValid()
);

console.log(
    "TEST BLOCK 12 COMPLETE"
);


// ============================================================
// TEST BLOCK 13 — MEMPOOL CLEANUP
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 13: MEMPOOL CLEANUP =========="
);

console.log(
    "Mempool before cleanup:",
    mempool.getTransactions()
);

mempool.removeTransactions(
    minedBlock.transactions
);

console.log(
    "Mempool after cleanup:",
    mempool.getTransactions()
);

console.log(
    "Final mempool size:",
    mempool.size
);

console.log(
    "TEST BLOCK 13 COMPLETE"
);


// ============================================================
// TEST BLOCK 14 — MERKLE TREE
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 14: MERKLE TREE =========="
);

const testTransactionIds = [
    "transaction-aaa",
    "transaction-bbb",
    "transaction-ccc",
    "transaction-ddd",
];

const merkleRoot =
    await calculateMerkleRoot(
        testTransactionIds
    );

console.log(
    "Test transaction IDs:",
    testTransactionIds
);

console.log(
    "Merkle root:",
    merkleRoot
);

console.log(
    "Merkle root length:",
    merkleRoot.length
);

console.log(
    "Expected root length:",
    64
);

console.log(
    "Merkle root valid length:",
    merkleRoot.length === 64
);

console.log(
    "TEST BLOCK 14 COMPLETE"
);


// ============================================================
// TEST BLOCK 15 — BLOCK TAMPERING
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 15: BLOCK TAMPERING =========="
);

// Save original block state.

const originalNonce =
    minedBlock.nonce;

const originalHash =
    minedBlock.hash;

// Modify the nonce.

minedBlock.nonce =
    originalNonce + 1;

// Recalculate hash so we are testing
// whether the NEW nonce still satisfies PoW.

minedBlock.hash =
    await calculateBlockHash(
        minedBlock
    );

console.log(
    "Tampered nonce:",
    minedBlock.nonce
);

console.log(
    "Tampered hash:",
    minedBlock.hash
);

console.log(
    "Tampered hash satisfies PoW:",
    minedBlock.hash.startsWith(
        "0".repeat(
            minedBlock.difficulty
        )
    )
);

console.log(
    "Blockchain valid after tampering:",
    await blockchain.isValid()
);

// Restore the original mined block.

minedBlock.nonce =
    originalNonce;

minedBlock.hash =
    originalHash;

console.log(
    "Blockchain valid after restoration:",
    await blockchain.isValid()
);

console.log(
    "TEST BLOCK 15 COMPLETE"
);


// ============================================================
// TEST BLOCK 16 — FINAL CORE SUMMARY
// ============================================================

console.log("");
console.log(
    "========== TEST BLOCK 16: FINAL CORE SUMMARY =========="
);

console.log(
    "Node ID:",
    nodeIdentity.nodeId
);

console.log(
    "Wallet:",
    wallet.address
);

console.log(
    "Blockchain height:",
    blockchain.chain.length - 1
);

console.log(
    "Blockchain blocks:",
    blockchain.chain.length
);

console.log(
    "Mempool size:",
    mempool.size
);

console.log(
    "Latest block hash:",
    blockchain.getLatestBlock().hash
);

console.log(
    "Latest block difficulty:",
    blockchain.getLatestBlock().difficulty
);

console.log(
    "Latest block nonce:",
    blockchain.getLatestBlock().nonce
);

console.log(
    "Blockchain valid:",
    await blockchain.isValid()
);

console.log(
    "TEST BLOCK 16 COMPLETE"
);


// ============================================================
// UI RENDER
// ============================================================

function render() {
    const state =
        getState();

    const appElement =
        document.getElementById(
            "app"
        );

    if (!appElement) {
        console.error(
            "NovaChain UI Error: #app element not found."
        );

        return;
    }

    appElement.innerHTML = `
        <div class="nova-shell">

            <header class="nova-header">

                <div class="brand">
                    <span class="brand-symbol">
                        ✦
                    </span>

                    <span class="brand-name">
                        NOVA
                    </span>
                </div>

                <div class="network-status">
                    <span class="status-dot"></span>

                    ${state.network.nodeStatus}
                </div>

            </header>


            <main class="nova-main">

                <section class="hero-card">

                    <div class="sparkle sparkle-one">
                        ✦
                    </div>

                    <div class="sparkle sparkle-two">
                        ✧
                    </div>

                    <p class="eyebrow">
                        ${APP_CONFIG.name.toUpperCase()}
                    </p>

                    <h1>
                        YOUR LITTLE<br />
                        PIECE OF THE<br />
                        NETWORK
                    </h1>

                    <p class="hero-description">
                        A browser-native decentralized
                        payment network where you can
                        actually watch the blockchain work.
                    </p>

                    <button
                        class="primary-button"
                        type="button"
                    >
                        ENTER THE NETWORK
                    </button>

                </section>


                <section class="network-card">

                    <div class="section-heading">
                        <span>☁</span>
                        <span>LOCAL NODE</span>
                    </div>

                    <div class="network-grid">

                        <div class="metric">

                            <span class="metric-label">
                                PEERS
                            </span>

                            <strong>
                                ${state.network.peerCount}
                            </strong>

                        </div>


                        <div class="metric">

                            <span class="metric-label">
                                BLOCK
                            </span>

                            <strong>
                                ${state.network.blockHeight}
                            </strong>

                        </div>


                        <div class="metric">

                            <span class="metric-label">
                                MEMPOOL
                            </span>

                            <strong>
                                ${state.network.mempoolSize}
                            </strong>

                        </div>


                        <div class="metric">

                            <span class="metric-label">
                                SYNC
                            </span>

                            <strong>
                                ${state.network.synchronization.status}
                            </strong>

                        </div>

                    </div>

                </section>


                <section class="info-card">

                    <div class="barcode">
                        || ||||| ||| |||||| || |||| |
                    </div>

                    <p>
                        ${APP_CONFIG.network.name}
                    </p>

                    <span>
                        Protocol:
                        ${APP_CONFIG.network.protocol}
                    </span>

                </section>

            </main>


            <nav class="bottom-nav">

                <button
                    class="nav-item active"
                    type="button"
                >
                    <span>✦</span>
                    <small>HOME</small>
                </button>


                <button
                    class="nav-item"
                    type="button"
                >
                    <span>◉</span>
                    <small>NETWORK</small>
                </button>


                <button
                    class="nav-item"
                    type="button"
                >
                    <span>◎</span>
                    <small>WALLET</small>
                </button>


                <button
                    class="nav-item"
                    type="button"
                >
                    <span>≋</span>
                    <small>ACTIVITY</small>
                </button>


                <button
                    class="nav-item"
                    type="button"
                >
                    <span>☁</span>
                    <small>NODE</small>
                </button>

            </nav>

        </div>
    `;
}


// ============================================================
// UI TEST BLOCK
// ============================================================

console.log("");
console.log(
    "========== UI TEST BLOCK =========="
);

render();

console.log(
    "NovaChain UI rendered successfully."
);

console.log(
    "UI TEST BLOCK COMPLETE"
);


// ============================================================
// NOVACHAIN STARTUP COMPLETE
// ============================================================

console.log("");
console.log("========================================");
console.log("       NOVACHAIN STARTUP COMPLETE");
console.log("========================================");