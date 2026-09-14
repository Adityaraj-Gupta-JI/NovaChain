import {
    calculateBlockHash,
} from "../block/block.js";

/*
|--------------------------------------------------------------------------
| NovaChain Proof of Work
|--------------------------------------------------------------------------
*/

export async function mineBlock(
    block,
    {
        onProgress,
        signal,
        yieldEvery = 100,
        startNonce = 0,
    } = {}
) {
    if (
        !block ||
        typeof block !==
            "object"
    ) {
        throw new TypeError(
            "A valid block is required."
        );
    }

    if (
        !Number.isInteger(
            block.difficulty
        ) ||
        block.difficulty < 0 ||
        block.difficulty > 64
    ) {
        throw new Error(
            "Invalid mining difficulty."
        );
    }

    if (
        !Number.isSafeInteger(
            startNonce
        ) ||
        startNonce < 0
    ) {
        throw new Error(
            "Invalid starting nonce."
        );
    }

    if (
        !Number.isInteger(
            yieldEvery
        ) ||
        yieldEvery <= 0
    ) {
        throw new Error(
            "yieldEvery must be a positive integer."
        );
    }

    const targetPrefix =
        "0".repeat(
            block.difficulty
        );

    let nonce =
        startNonce;

    while (true) {
        if (
            signal?.aborted
        ) {
            throw new DOMException(
                "Mining cancelled.",
                "AbortError"
            );
        }

        if (
            !Number.isSafeInteger(
                nonce
            )
        ) {
            throw new Error(
                "Nonce space exhausted."
            );
        }

        block.nonce =
            nonce;

        block.hash =
            await calculateBlockHash(
                block
            );

        const progress = {
            nonce,
            hash:
                block.hash,
            difficulty:
                block.difficulty,
            targetPrefix,
            completed:
                false,
        };

        if (
            block.hash.startsWith(
                targetPrefix
            )
        ) {
            onProgress?.({
                ...progress,
                completed:
                    true,
            });

            return block;
        }

        nonce += 1;

        if (
            nonce %
            yieldEvery ===
            0
        ) {
            onProgress?.(
                progress
            );

            await new Promise(
                (resolve) =>
                    setTimeout(
                        resolve,
                        0
                    )
            );
        }
    }
}