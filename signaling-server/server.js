import { WebSocketServer } from "ws";

const PORT = Number(
    process.env.PORT ?? 8787
);

const wss =
    new WebSocketServer({
        port: PORT,
    });

/*
 * Connected NovaChain peers.
 *
 * This map contains only live connection
 * metadata. It does NOT contain blockchain
 * state or transaction history.
 */
const peers = new Map();

function safeSend(
    socket,
    payload
) {
    if (
        socket.readyState === 1
    ) {
        try {
            socket.send(
                JSON.stringify(
                    payload
                )
            );
        } catch (error) {
            console.error(
                "NovaChain relay send failed:",
                error
            );
        }
    }
}

function broadcast(
    payload,
    exceptSocket = null
) {
    for (
        const peer
        of peers.values()
    ) {
        if (
            peer.socket ===
            exceptSocket
        ) {
            continue;
        }

        safeSend(
            peer.socket,
            payload
        );
    }
}

wss.on(
    "connection",
    (socket) => {
        let peerRecord = null;

        socket.on(
            "message",
            (raw) => {
                let message;

                try {
                    message =
                        JSON.parse(
                            raw.toString()
                        );
                } catch {
                    safeSend(
                        socket,
                        {
                            type:
                                "error",

                            error:
                                "Invalid JSON message.",
                        }
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
                 * JOIN
                 *
                 * Register this browser node.
                 */
                if (
                    message.type ===
                    "join"
                ) {
                    const nodeId =
                        typeof message.nodeId ===
                            "string" &&
                        message.nodeId.length >
                            0
                            ? message.nodeId
                            : `anonymous-${Date.now()}-${Math.random()}`;

                    /*
                     * Prevent duplicate live
                     * connections using the same
                     * persistent node identity.
                     */
                    if (
                        peers.has(
                            nodeId
                        )
                    ) {
                        safeSend(
                            socket,
                            {
                                type:
                                    "error",

                                error:
                                    "Node ID is already connected.",
                            }
                        );

                        socket.close();

                        return;
                    }

                    peerRecord = {
                        nodeId,

                        walletAddress:
                            message.walletAddress ??
                            null,

                        network:
                            message.network ??
                            "nova-main",

                        protocol:
                            message.protocol ??
                            "NCCP-0.1",

                        socket,
                    };

                    peers.set(
                        nodeId,
                        peerRecord
                    );

                    /*
                     * Confirm join to
                     * the newly connected node.
                     */
                    safeSend(
                        socket,
                        {
                            type:
                                "joined",

                            nodeId,

                            network:
                                peerRecord.network,

                            peerCount:
                                peers.size,

                            protocol:
                                "NCCP-0.1",

                            timestamp:
                                Date.now(),
                        }
                    );

                    /*
                     * Tell existing peers
                     * that a new peer exists.
                     *
                     * The new peer is excluded
                     * from this message.
                     */
                    broadcast(
                        {
                            type:
                                "peer-joined",

                            node: {
                                nodeId,

                                walletAddress:
                                    peerRecord.walletAddress,
                            },

                            peerCount:
                                peers.size,
                        },
                        socket
                    );

                    return;
                }

                /*
                 * Everything else requires
                 * an authenticated live join.
                 */
                if (!peerRecord) {
                    safeSend(
                        socket,
                        {
                            type:
                                "error",

                            error:
                                "Join the NovaChain network first.",
                        }
                    );

                    return;
                }

                /*
                 * Relay-only behavior.
                 *
                 * The server does not:
                 *
                 * - mine
                 * - validate the chain
                 * - modify UTXOs
                 * - store blockchain data
                 * - own the ledger
                 *
                 * It simply forwards NCCP
                 * messages to current peers.
                 */
                broadcast(
                    {
                        ...message,

                        forwardedAt:
                            Date.now(),
                    },
                    socket
                );
            }
        );

        socket.on(
            "close",
            () => {
                if (!peerRecord) {
                    return;
                }

                peers.delete(
                    peerRecord.nodeId
                );

                broadcast({
                    type:
                        "peer-left",

                    nodeId:
                        peerRecord.nodeId,

                    peerCount:
                        peers.size,
                });
            }
        );

        socket.on(
            "error",
            (error) => {
                console.error(
                    "NovaChain peer socket error:",
                    error
                );
            }
        );
    }
);

wss.on(
    "listening",
    () => {
        const address =
            wss.address();

        const port =
            typeof address ===
                "object" &&
            address
                ? address.port
                : PORT;

        console.log(
            `NovaChain NCCP relay listening on ws://localhost:${port}`
        );
    }
);

wss.on(
    "error",
    (error) => {
        console.error(
            "NovaChain relay server error:",
            error
        );
    }
);