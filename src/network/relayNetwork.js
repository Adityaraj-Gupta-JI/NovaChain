const DEFAULT_SIGNALING_URL =
    "ws://localhost:8787";

/*
|--------------------------------------------------------------------------
| Binary-safe wire encoding
|--------------------------------------------------------------------------
|
| WebSocket transport uses JSON.
|
| ECDSA signatures may contain Uint8Array /
| ArrayBuffer data.
|
| We encode these values explicitly instead
| of letting JSON.stringify transform them
| into ordinary objects.
|--------------------------------------------------------------------------
*/

function bytesToBase64(
    bytes
) {
    const array =
        bytes instanceof Uint8Array
            ? bytes
            : new Uint8Array(
                bytes
            );

    let binary =
        "";

    const chunkSize =
        0x8000;

    for (
        let index = 0;
        index < array.length;
        index += chunkSize
    ) {
        binary +=
            String.fromCharCode(
                ...array.subarray(
                    index,
                    index +
                        chunkSize
                )
            );
    }

    return btoa(
        binary
    );
}

function base64ToBytes(
    value
) {
    const binary =
        atob(value);

    const bytes =
        new Uint8Array(
            binary.length
        );

    for (
        let index = 0;
        index <
        binary.length;
        index += 1
    ) {
        bytes[index] =
            binary.charCodeAt(
                index
            );
    }

    return bytes;
}

function encodeForWire(
    value
) {
    if (
        value instanceof
        Uint8Array
    ) {
        return {
            __ncType:
                "bytes",

            value:
                bytesToBase64(
                    value
                ),
        };
    }

    if (
        value instanceof
        ArrayBuffer
    ) {
        return {
            __ncType:
                "bytes",

            value:
                bytesToBase64(
                    value
                ),
        };
    }

    if (
        Array.isArray(value)
    ) {
        return value.map(
            encodeForWire
        );
    }

    if (
        value &&
        typeof value ===
            "object"
    ) {
        const output =
            {};

        for (
            const [
                key,
                child,
            ] of Object.entries(
                value
            )
        ) {
            output[key] =
                encodeForWire(
                    child
                );
        }

        return output;
    }

    return value;
}

function decodeFromWire(
    value
) {
    if (
        Array.isArray(value)
    ) {
        return value.map(
            decodeFromWire
        );
    }

    if (
        value &&
        typeof value ===
            "object"
    ) {
        if (
            value.__ncType ===
                "bytes" &&
            typeof value.value ===
                "string"
        ) {
            return base64ToBytes(
                value.value
            );
        }

        const output =
            {};

        for (
            const [
                key,
                child,
            ] of Object.entries(
                value
            )
        ) {
            output[key] =
                decodeFromWire(
                    child
                );
        }

        return output;
    }

    return value;
}

function createMessageId() {
    if (
        globalThis.crypto
            ?.randomUUID
    ) {
        return crypto.randomUUID();
    }

    return (
        `nc-${Date.now()}-` +
        Math.random()
            .toString(16)
            .slice(2)
    );
}

export class RelayNetwork {
    constructor({
        nodeId,
        walletAddress,
        signalingUrl =
            DEFAULT_SIGNALING_URL,
        onMessage,
        onStatus,
    } = {}) {
        this.nodeId =
            nodeId ??
            null;

        this.walletAddress =
            walletAddress ??
            null;

        this.signalingUrl =
            signalingUrl;

        this.onMessage =
            onMessage;

        this.onStatus =
            onStatus;

        this.socket =
            null;

        this.connected =
            false;

        this.destroyed =
            false;

        this.reconnectTimer =
            null;

        this.reconnectAttempt =
            0;

        this.seenMessages =
            new Set();

        this.statusSnapshot = {
            status:
                "OFFLINE",

            peerCount:
                0,

            connected:
                false,

            url:
                signalingUrl,

            error:
                null,
        };
    }

    connect() {
        if (
            this.destroyed
        ) {
            return;
        }

        if (
            this.socket &&
            (
                this.socket
                    .readyState ===
                    WebSocket.OPEN ||
                this.socket
                    .readyState ===
                    WebSocket.CONNECTING
            )
        ) {
            return;
        }

        this.setStatus(
            "CONNECTING"
        );

        try {
            this.socket =
                new WebSocket(
                    this.signalingUrl
                );
        } catch (
            error
        ) {
            this.setStatus(
                "OFFLINE",
                error
            );

            this.scheduleReconnect();

            return;
        }

        this.socket.addEventListener(
            "open",
            () => {
                this.connected =
                    true;

                this.reconnectAttempt =
                    0;

                this.setStatus(
                    "ONLINE"
                );

                this.send({
                    type:
                        "join",

                    nodeId:
                        this.nodeId,

                    walletAddress:
                        this.walletAddress,

                    network:
                        "nova-main",

                    protocol:
                        "NCCP-0.2",
                });
            }
        );

        this.socket.addEventListener(
            "message",
            (event) => {
                this.handleMessage(
                    event.data
                );
            }
        );

        this.socket.addEventListener(
            "close",
            () => {
                this.connected =
                    false;

                this.setStatus(
                    "OFFLINE"
                );

                if (
                    !this.destroyed
                ) {
                    this.scheduleReconnect();
                }
            }
        );

        this.socket.addEventListener(
            "error",
            (error) => {
                this.setStatus(
                    "ERROR",
                    error
                );
            }
        );
    }

    disconnect() {
        this.destroyed =
            true;

        if (
            this.reconnectTimer
        ) {
            clearTimeout(
                this.reconnectTimer
            );
        }

        this.reconnectTimer =
            null;

        try {
            this.socket?.close();
        } catch {
            // Ignore close errors.
        }

        this.socket =
            null;

        this.connected =
            false;

        this.setStatus(
            "OFFLINE"
        );
    }

    send(
        message
    ) {
        if (
            !this.socket ||
            this.socket.readyState !==
                WebSocket.OPEN
        ) {
            return false;
        }

        const wireMessage =
            encodeForWire({
                ...message,

                messageId:
                    message.messageId ??
                    createMessageId(),

                senderNodeId:
                    this.nodeId,

                protocol:
                    message.protocol ??
                    "NCCP-0.2",

                network:
                    message.network ??
                    "nova-main",

                timestamp:
                    message.timestamp ??
                    Date.now(),
            });

        try {
            this.socket.send(
                JSON.stringify(
                    wireMessage
                )
            );

            return true;
        } catch (
            error
        ) {
            console.error(
                "NovaChain network send failed:",
                error
            );

            return false;
        }
    }

    requestState() {
        return this.send({
            type:
                "state-request",

            requesterNodeId:
                this.nodeId,
        });
    }

    broadcastTransaction(
        transaction
    ) {
        return this.send({
            type:
                "transaction",

            transaction,
        });
    }

    broadcastBlock(
        block
    ) {
        return this.send({
            type:
                "block",

            block,
        });
    }

    sendStateTo(
        recipientNodeId,
        state
    ) {
        return this.send({
            type:
                "state-response",

            recipientNodeId,

            state,
        });
    }

    handleMessage(
        rawData
    ) {
        try {
            const parsed =
                typeof rawData ===
                    "string"
                    ? JSON.parse(
                        rawData
                    )
                    : rawData;

            const message =
                decodeFromWire(
                    parsed
                );

            if (
                !message ||
                typeof message.type !==
                    "string"
            ) {
                return;
            }

            if (
                message.messageId
            ) {
                if (
                    this.seenMessages.has(
                        message.messageId
                    )
                ) {
                    return;
                }

                this.seenMessages.add(
                    message.messageId
                );

                if (
                    this.seenMessages.size >
                    2000
                ) {
                    const first =
                        this.seenMessages
                            .values()
                            .next()
                            .value;

                    this.seenMessages.delete(
                        first
                    );
                }
            }

            if (
                message.peerCount !==
                undefined
            ) {
                this.statusSnapshot = {
                    ...this
                        .statusSnapshot,

                    peerCount:
                        Number(
                            message.peerCount
                        ) || 0,

                    connected:
                        this.connected,
                };

                this.onStatus?.(
                    this.statusSnapshot
                );
            }

            Promise.resolve(
                this.onMessage?.(
                    message
                )
            ).catch(
                (error) => {
                    console.error(
                        "NovaChain network message handler failed:",
                        error
                    );
                }
            );
        } catch (
            error
        ) {
            console.warn(
                "NovaChain received invalid network message:",
                error
            );
        }
    }

    scheduleReconnect() {
        if (
            this.destroyed ||
            this.reconnectTimer
        ) {
            return;
        }

        this.reconnectAttempt += 1;

        const delay =
            Math.min(
                10_000,

                500 *
                    2 **
                        Math.min(
                            this.reconnectAttempt -
                                1,

                            5
                        )
            );

        this.reconnectTimer =
            setTimeout(
                () => {
                    this.reconnectTimer =
                        null;

                    this.connect();
                },
                delay
            );
    }

    setStatus(
        status,
        error = null
    ) {
        this.statusSnapshot = {
            ...this
                .statusSnapshot,

            status,

            connected:
                this.connected,

            error,

            url:
                this.signalingUrl,
        };

        this.onStatus?.(
            this.statusSnapshot
        );
    }
}

export function getDefaultSignalingUrl() {
    return (
        import.meta.env
            ?.VITE_NOVACHAIN_SIGNALING_URL ??
        DEFAULT_SIGNALING_URL
    );
}