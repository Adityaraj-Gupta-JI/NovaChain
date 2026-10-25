/*
 * NovaChain browser network transport.
 *
 * The WebSocket server is only a relay.
 *
 * It does NOT:
 *   - own the blockchain
 *   - own wallets
 *   - store private keys
 *   - calculate balances
 *
 * It only forwards NCCP messages between connected nodes.
 *
 * Messages:
 *   join
 *   state-request
 *   state-response
 *   transaction
 *   block
 */

const DEFAULT_SIGNALING_URL =
    "ws://localhost:8787";

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
            nodeId ?? null;

        this.walletAddress =
            walletAddress ?? null;

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

        this.statusSnapshot = {
            status:
                "OFFLINE",

            peerCount:
                0,

            url:
                this.signalingUrl,

            connected:
                false,
        };
    }

    connect() {
        if (this.destroyed) {
            return;
        }

        if (
            this.socket &&
            (
                this.socket.readyState ===
                    WebSocket.OPEN ||
                this.socket.readyState ===
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
        } catch (error) {
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
                        "NCCP-0.1",

                    timestamp:
                        Date.now(),
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

            this.reconnectTimer =
                null;
        }

        if (
            this.socket
        ) {
            this.socket.close();
        }

        this.socket =
            null;

        this.connected =
            false;

        this.setStatus(
            "OFFLINE"
        );
    }

    send(message) {
        if (
            !this.socket ||
            this.socket.readyState !==
                WebSocket.OPEN
        ) {
            return false;
        }

        try {
            this.socket.send(
                JSON.stringify({
                    ...message,

                    senderNodeId:
                        this.nodeId,

                    protocol:
                        message.protocol ??
                        "NCCP-0.1",
                })
            );

            return true;
        } catch (error) {
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

    broadcastState(
        state
    ) {
        return this.send({
            type:
                "state-response",

            state,
        });
    }

    /*
     * Send state directly to one requesting node.
     */
    sendStateTo(
        nodeId,
        state
    ) {
        return this.send({
            type:
                "state-response",

            recipientNodeId:
                nodeId ?? null,

            state,
        });
    }

    /*
     * Compatibility helper.
     *
     * The browser previously produced:
     *
     *   sendStateTo is not a function
     *
     * Keep this explicit alias so the transport remains compatible
     * with code using that method name.
     */
    sendState(
        nodeId,
        state
    ) {
        return this.sendStateTo(
            nodeId,
            state
        );
    }

    handleMessage(
        rawData
    ) {
        let message;

        try {
            message =
                typeof rawData ===
                    "string"
                    ? JSON.parse(
                        rawData
                    )
                    : rawData;
        } catch (error) {
            console.warn(
                "NovaChain received invalid network JSON.",
                error
            );

            return;
        }

        if (
            !message ||
            typeof message.type !==
                "string"
        ) {
            return;
        }

        /*
         * Network membership messages update telemetry.
         */
        if (
            message.type ===
                "joined" ||
            message.type ===
                "peer-joined" ||
            message.type ===
                "peer-left"
        ) {
            this.statusSnapshot = {
                ...this.statusSnapshot,

                peerCount:
                    Number(
                        message.peerCount ??
                        this.statusSnapshot.peerCount ??
                        0
                    ),

                status:
                    this.connected
                        ? "ONLINE"
                        : this.statusSnapshot.status,

                connected:
                    this.connected,

                url:
                    this.signalingUrl,
            };
        }

        try {
            /*
             * onMessage may be async.
             * Promise rejection is explicitly caught here
             * so network errors are not left as unhandled promises.
             */
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
        } catch (error) {
            console.error(
                "NovaChain network message handler failed:",
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

        this.reconnectAttempt +=
            1;

        const delay =
            Math.min(
                10_000,

                500 *
                    2 **
                        Math.min(
                            this.reconnectAttempt - 1,
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
            ...this.statusSnapshot,

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
    if (
        typeof import.meta !==
            "undefined" &&
        import.meta.env?.VITE_NOVACHAIN_SIGNALING_URL
    ) {
        return (
            import.meta.env
                .VITE_NOVACHAIN_SIGNALING_URL
        );
    }

    // Use the deployed Worker hub in production; keep the local relay in Vite dev.
    if (typeof window !== "undefined" && !import.meta.env?.DEV) {
        const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${scheme}//${window.location.host}/ws`;
    }

    return DEFAULT_SIGNALING_URL;
}