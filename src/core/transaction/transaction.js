import { sha256 } from "../crypto/hash.js";
import { signData } from "../crypto/signature.js";

function getTransactionPayload(transaction) {
    return JSON.stringify({
        version: transaction.version,
        inputs: transaction.inputs,
        outputs: transaction.outputs,
        timestamp: transaction.timestamp,
    });
}

export function createCoinbaseTransaction({
    minerAddress,
    reward,
}) {
    if (
        typeof minerAddress !== "string" ||
        !minerAddress
    ) {
        throw new Error(
            "Invalid miner address."
        );
    }

    if (
        !Number.isSafeInteger(reward) ||
        reward <= 0
    ) {
        throw new Error(
            "Coinbase reward must be a positive integer."
        );
    }

    return {
        type: "coinbase",
        version: 1,
        inputs: [],
        outputs: [
            {
                address: minerAddress,
                amount: reward,
            },
        ],
        timestamp: Date.now(),
        id: null,
    };
}


export async function finalizeCoinbaseTransaction(
    transaction
) {
    if (
        !transaction ||
        transaction.type !== "coinbase"
    ) {
        throw new Error(
            "Transaction is not a coinbase transaction."
        );
    }

    transaction.id =
        await sha256(
            JSON.stringify({
                type:
                    transaction.type,

                version:
                    transaction.version,

                inputs:
                    transaction.inputs,

                outputs:
                    transaction.outputs,

                timestamp:
                    transaction.timestamp,
            })
        );

    return transaction;
}

export function createTransaction({
    inputs = [],
    outputs = [],
}) {
    if (!Array.isArray(inputs)) {
        throw new TypeError("Transaction inputs must be an array.");
    }

    if (!Array.isArray(outputs) || outputs.length === 0) {
        throw new Error(
            "Transaction must contain at least one output."
        );
    }

    for (const output of outputs) {
        if (
            typeof output.address !== "string" ||
            !output.address
        ) {
            throw new Error("Invalid output address.");
        }

        if (
            !Number.isSafeInteger(output.amount) ||
            output.amount <= 0
        ) {
            throw new Error(
                "Output amount must be a positive integer."
            );
        }
    }

    return {
        version: 1,
        inputs,
        outputs,
        timestamp: Date.now(),
        id: null,
    };
}

export async function signTransaction(
    transaction,
    privateKey,
    publicKey
) {
    const payload = serializeTransaction(transaction);

    const signature = await signData(
        privateKey,
        payload
    );

    const publicKeyJwk = await crypto.subtle.exportKey(
        "jwk",
        publicKey
    );

    transaction.inputs = transaction.inputs.map((input) => ({
        ...input,
        publicKey: publicKeyJwk,
        signature: Array.from(signature),
    }));

    transaction.id = await sha256(
        serializeTransaction(transaction)
    );

    return transaction;
}

export function serializeTransaction(transaction) {
    return JSON.stringify({
        version: transaction.version,
        inputs: transaction.inputs.map((input) => ({
            transactionId: input.transactionId,
            outputIndex: input.outputIndex,
        })),
        outputs: transaction.outputs,
        timestamp: transaction.timestamp,
    });
}