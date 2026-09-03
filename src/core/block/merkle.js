import { sha256 } from "../crypto/hash.js";

/**
 * Calculate the Merkle root of transaction IDs.
 */
export async function calculateMerkleRoot(transactionIds) {
    if (!Array.isArray(transactionIds)) {
        throw new TypeError("Transaction IDs must be an array.");
    }

    if (transactionIds.length === 0) {
        return sha256("");
    }

    let level = [...transactionIds];

    while (level.length > 1) {
        const nextLevel = [];

        for (let i = 0; i < level.length; i += 2) {
            const left = level[i];

            const right =
                level[i + 1] ?? left;

            nextLevel.push(
                await sha256(left + right)
            );
        }

        level = nextLevel;
    }

    return level[0];
}