import { calculateBlockHash } from "../block/block.js";

/**
 * Mine a block using Proof of Work.
 *
 * NovaChain represents mining difficulty as the number
 * of leading hexadecimal zeroes required in the block hash.
 *
 * Example:
 *
 * difficulty = 3
 *
 * Valid:
 * 000abc123...
 *
 * Invalid:
 * 001abc123...
 *
 * Mining is intentionally asynchronous so the browser UI
 * remains responsive while Proof of Work is running.
 */
export async function mineBlock(
    block,
    {
        onProgress,
        signal,
        yieldEvery = 100,
    } = {}
) {
    if (
        !block ||
        typeof block !== "object"
    ) {
        throw new TypeError(
            "A valid block is required."
        );
    }

    if (
        !Number.isInteger(block.difficulty) ||
        block.difficulty < 0 ||
        block.difficulty > 64
    ) {
        throw new Error(
            "Invalid mining difficulty."
        );
    }

    if (
        !Number.isInteger(yieldEvery) ||
        yieldEvery <= 0
    ) {
        throw new Error(
            "yieldEvery must be a positive integer."
        );
    }

    /*
     * Difficulty 0 means every valid hash satisfies
     * the Proof of Work target.
     */
    const targetPrefix =
        "0".repeat(block.difficulty);

    /*
     * Continue from the block's current nonce when possible.
     */
    let nonce =
        Number.isSafeInteger(block.nonce) &&
        block.nonce >= 0
            ? block.nonce
            : 0;

    while (true) {
        /*
         * Allow the caller to cancel mining.
         */
        if (signal?.aborted) {
            throw new DOMException(
                "Mining cancelled.",
                "AbortError"
            );
        }

        /*
         * Set the candidate nonce.
         */
        block.nonce = nonce;

        /*
         * Calculate the candidate block hash.
         */
        block.hash =
            await calculateBlockHash(block);

        /*
         * Check whether the hash satisfies
         * the Proof of Work target.
         */
        if (
            block.hash.startsWith(
                targetPrefix
            )
        ) {
            /*
             * Final valid mined block.
             */
            onProgress?.({
                nonce,
                hash: block.hash,
                difficulty: block.difficulty,
                completed: true,
            });

            return block;
        }

        /*
         * Try the next nonce.
         */
        nonce++;

        /*
         * Periodically yield execution back to
         * the browser so the UI does not freeze.
         */
        if (
            nonce % yieldEvery === 0
        ) {
            onProgress?.({
                nonce,
                hash: block.hash,
                difficulty: block.difficulty,
                completed: false,
            });

            await new Promise(
                (resolve) => {
                    setTimeout(
                        resolve,
                        0
                    );
                }
            );
        }
    }
}