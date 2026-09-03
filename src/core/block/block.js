import { sha256 } from "../crypto/hash.js";
import { calculateMerkleRoot } from "./merkle.js";

export async function createBlock({
    index,
    previousHash,
    transactions = [],
    difficulty = 3,
}) {
    if (!Number.isInteger(index) || index < 0) {
        throw new Error("Invalid block index.");
    }

    if (typeof previousHash !== "string") {
        throw new Error("Invalid previous block hash.");
    }

    if (!Array.isArray(transactions)) {
        throw new TypeError("Transactions must be an array.");
    }

    const transactionIds = transactions.map(
        (transaction) => transaction.id
    );

    const merkleRoot =
        await calculateMerkleRoot(transactionIds);

    return {
        index,
        previousHash,
        timestamp: Date.now(),
        transactions,
        merkleRoot,
        difficulty,
        nonce: 0,
        hash: null,
    };
}

export async function calculateBlockHash(block) {
    const header = JSON.stringify({
        index: block.index,
        previousHash: block.previousHash,
        timestamp: block.timestamp,
        merkleRoot: block.merkleRoot,
        difficulty: block.difficulty,
        nonce: block.nonce,
    });

    return sha256(header);
}