/*
 * NovaChain protocol constants and deterministic consensus helpers.
 */

export const PROTOCOL = Object.freeze({
    version: 1,

    networkId:
        "nova-main",

    initialMiningReward:
        50_000,

    halvingInterval:
        100,

    /*
     * Educational Proof-of-Work target.
     */
    targetBlockTimeMs:
        5_000,

    difficultyAdjustmentInterval:
        3,

    baseDifficulty:
        3,

    minDifficulty:
        2,

    maxDifficulty:
        5,

    maxTransactionsPerBlock:
        20,
});

export function clampDifficulty(
    value
) {
    if (
        !Number.isFinite(value)
    ) {
        return PROTOCOL.baseDifficulty;
    }

    return Math.max(
        PROTOCOL.minDifficulty,
        Math.min(
            PROTOCOL.maxDifficulty,
            Math.trunc(value)
        )
    );
}

export function getBlockReward(
    height
) {
    if (
        !Number.isSafeInteger(
            height
        ) ||
        height < 1
    ) {
        return 0;
    }

    const halvings =
        Math.floor(
            (height - 1) /
            PROTOCOL.halvingInterval
        );

    if (
        halvings >= 31
    ) {
        return 0;
    }

    return Math.floor(
        PROTOCOL.initialMiningReward /
        (2 ** halvings)
    );
}

/*
|--------------------------------------------------------------------------
| Difficulty calculation
|--------------------------------------------------------------------------
|
| Historical blocks are not retroactively
| invalidated by the new adjustment schedule.
|
| The function determines the difficulty
| for the NEXT block.
|--------------------------------------------------------------------------
*/

export function getNextDifficulty(
    chain
) {
    if (
        !Array.isArray(chain) ||
        chain.length <= 1
    ) {
        return PROTOCOL.baseDifficulty;
    }

    const latest =
        chain[
            chain.length - 1
        ];

    const latestDifficulty =
        clampDifficulty(
            Number(
                latest?.difficulty
            )
        );

    if (
        !Number.isInteger(
            latest?.index
        ) ||
        latest.index <= 0
    ) {
        return latestDifficulty;
    }

    const interval =
        PROTOCOL
            .difficultyAdjustmentInterval;

    if (
        latest.index % interval !==
        0
    ) {
        return latestDifficulty;
    }

    const startIndex =
        chain.length -
        interval;

    if (
        startIndex < 1
    ) {
        return latestDifficulty;
    }

    const first =
        chain[startIndex];

    const firstTimestamp =
        Number(
            first?.timestamp
        );

    const latestTimestamp =
        Number(
            latest?.timestamp
        );

    if (
        !Number.isFinite(
            firstTimestamp
        ) ||
        !Number.isFinite(
            latestTimestamp
        )
    ) {
        return latestDifficulty;
    }

    const elapsed =
        Math.max(
            1,
            latestTimestamp -
                firstTimestamp
        );

    const measuredIntervals =
        Math.max(
            1,
            interval - 1
        );

    const target =
        PROTOCOL
            .targetBlockTimeMs *
        measuredIntervals;

    if (
        elapsed <
        target * 0.5
    ) {
        return clampDifficulty(
            latestDifficulty + 1
        );
    }

    if (
        elapsed >
        target * 2
    ) {
        return clampDifficulty(
            latestDifficulty - 1
        );
    }

    return latestDifficulty;
}

/*
|--------------------------------------------------------------------------
| Proof-of-Work work
|--------------------------------------------------------------------------
*/

export function calculateBlockWork(
    difficulty
) {
    const normalized =
        Math.max(
            0,
            Math.min(
                64,
                Math.trunc(
                    Number(
                        difficulty
                    ) || 0
                )
            )
        );

    return (
        16n **
        BigInt(
            normalized
        )
    );
}

export function calculateChainWork(
    chain
) {
    if (
        !Array.isArray(chain)
    ) {
        throw new TypeError(
            "Chain must be an array."
        );
    }

    let work =
        0n;

    for (
        const block
        of chain
    ) {
        work +=
            calculateBlockWork(
                block?.difficulty ??
                    0
            );
    }

    return work;
}

export function chainWorkToString(
    chain
) {
    return calculateChainWork(
        chain
    ).toString();
}

/*
|--------------------------------------------------------------------------
| Canonical chain comparison
|--------------------------------------------------------------------------
|
| Highest cumulative PoW work wins.
|--------------------------------------------------------------------------
*/

export function compareChains(
    localChain,
    candidateChain
) {
    const localWork =
        calculateChainWork(
            localChain
        );

    const candidateWork =
        calculateChainWork(
            candidateChain
        );

    if (
        candidateWork >
        localWork
    ) {
        return 1;
    }

    if (
        candidateWork <
        localWork
    ) {
        return -1;
    }

    if (
        candidateChain.length >
        localChain.length
    ) {
        return 1;
    }

    if (
        candidateChain.length <
        localChain.length
    ) {
        return -1;
    }

    const localTip =
        String(
            localChain.at(-1)?.hash ??
                ""
        );

    const candidateTip =
        String(
            candidateChain.at(-1)?.hash ??
                ""
        );

    if (
        candidateTip <
        localTip
    ) {
        return 1;
    }

    if (
        candidateTip >
        localTip
    ) {
        return -1;
    }

    return 0;
}