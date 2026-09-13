/*
 * NovaChain browser network transport.
 *
 * MVP transport:
 * Browser Node
 *      ↓
 * WebSocket
 *      ↓
 * NCCP Relay
 *      ↓
 * Other Browser Nodes
 *
 * The relay does NOT own the blockchain ledger.
 * Each browser keeps its own Blockchain / UTXO / Mempool / IndexedDB state.
 *
 * Supported NCCP message types:
 *   join
 *   state-request
 *   state-response
 *   transaction
 *   block
 */

const DEFAULT_SIGNALING_URL = "ws://localhost:8787";

export class RelayNetwork {
    constructor({
        nodeId,
        walletAddress,
        signalingUrl = DEFAULT_SIGNALING_URL,
        onMessage,
        onStatus,
    } = {}) {
        this.nodeId = nodeId ?? null;
        this.walletAddress = walletAddress ?? null;
        this.signalingUrl = signalingUrl;
        this.onMessage = onMessage;
        this.onStatus = onStatus;

        this.socket = null;
        this.connected = false;
        this.destroyed = false;

        this.reconnectTimer = null;
        this.reconnectAttempt = 0;

        this.statusSnapshot = {
            status: "OFFLINE",
            peerCount: 0,
            connected: false,
            url: this.signalingUrl,
            error: null,
        };
    }

    connect() {
        if (this.destroyed) {
            return;
        }

        if (
            this.socket &&
            (
                this.socket.readyState === WebSocket.OPEN ||
                this.socket.readyState === WebSocket.CONNECTING
            )
        ) {
            return;
        }

        this.setStatus("CONNECTING");

        try {
            this.socket = new WebSocket(
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
                this.connected = true;
                this.reconnectAttempt = 0;

                this.setStatus(
                    "ONLINE"
                );

                this.send({
                    type: "join",
                    nodeId: this.nodeId,
                    walletAddress:
                        this.walletAddress,
                    network: "nova-main",
                    protocol: "NCCP-0.1",
                    timestamp: Date.now(),
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
                this.connected = false;

                this.setStatus(
                    "OFFLINE"
                );

                if (!this.destroyed) {
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
        this.destroyed = true;

        if (this.reconnectTimer) {
            clearTimeout(
                this.reconnectTimer
            );

            this.reconnectTimer = null;
        }

        if (this.socket) {
            try {
                this.socket.close();
            } catch {
                // Ignore close errors.
            }
        }

        this.socket = null;
        this.connected = false;

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
            const envelope = {
                ...message,

                senderNodeId:
                    this.nodeId,

                protocol:
                    message.protocol ??
                    "NCCP-0.1",

                timestamp:
                    message.timestamp ??
                    Date.now(),
            };

            this.socket.send(
                JSON.stringify(
                    envelope
                )
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
            type: "state-request",
            requesterNodeId:
                this.nodeId,
        });
    }

    broadcastTransaction(
        transaction
    ) {
        return this.send({
            type: "transaction",
            transaction,
        });
    }

    broadcastBlock(block) {
        return this.send({
            type: "block",
            block,
        });
    }

    broadcastState(state) {
        return this.send({
            type: "state-response",
            state,
        });
    }

    handleMessage(rawData) {
        let message;

        try {
            message =
                typeof rawData === "string"
                    ? JSON.parse(rawData)
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
            typeof message.type !== "string"
        ) {
            return;
        }

        if (
            message.type === "joined" ||
            message.type === "peer-joined" ||
            message.type === "peer-left"
        ) {
            this.statusSnapshot = {
                ...this.statusSnapshot,

                status:
                    this.connected
                        ? "ONLINE"
                        : this.statusSnapshot.status,

                connected:
                    this.connected,

                peerCount:
                    Number(
                        message.peerCount ??
                        this.statusSnapshot.peerCount ??
                        0
                    ),

                url:
                    this.signalingUrl,

                error:
                    null,
            };

            this.onStatus?.(
                this.statusSnapshot
            );
        }

        try {
            this.onMessage?.(
                message
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
            setTimeout(() => {
                this.reconnectTimer =
                    null;

                this.connect();
            }, delay);
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

    return DEFAULT_SIGNALING_URL;
}