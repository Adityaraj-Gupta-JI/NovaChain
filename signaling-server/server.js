import {
    WebSocketServer,
} from "ws";

const PORT =
    Number(
        process.env.PORT ??
            8787
    );

const wss =
    new WebSocketServer({
        port:
            PORT,
    });

const peers =
    new Map();

function safeSend(
    socket,
    payload
) {
    if (
        socket.readyState ===
        1
    ) {
        try {
            socket.send(
                JSON.stringify(
                    payload
                )
            );
        } catch (
            error
        ) {
            console.error(
                "NovaChain relay send error:",
                error
            );
        }
    }
}

function broadcast(
    payload,
    exceptNodeId = null
) {
    for (
        const peer
        of peers.values()
    ) {
        if (
            peer.nodeId ===
            exceptNodeId
        ) {
            continue;
        }

        safeSend(
            peer.socket,
            payload
        );
    }
}

function directSend(
    nodeId,
    payload
) {
    const peer =
        peers.get(
            nodeId
        );

    if (!peer) {
        return false;
    }

    safeSend(
        peer.socket,
        payload
    );

    return true;
}

wss.on(
    "connection",
    (socket) => {
        let peer =
            null;

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
                                "Invalid JSON.",
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
                ----------------------------------------------------------
                JOIN
                ----------------------------------------------------------
                */

                if (
                    message.type ===
                    "join"
                ) {
                    const nodeId =
                        typeof message.nodeId ===
                            "string" &&
                        message.nodeId.trim()
                            .length > 0
                            ? message.nodeId.trim()
                            : null;

                    if (!nodeId) {
                        safeSend(
                            socket,
                            {
                                type:
                                    "error",

                                error:
                                    "nodeId is required.",
                            }
                        );

                        socket.close();

                        return;
                    }

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

                    peer = {
                        nodeId,

                        walletAddress:
                            message
                                .walletAddress ??
                            null,

                        network:
                            message.network ??
                            "nova-main",

                        protocol:
                            message.protocol ??
                            "NCCP-0.2",

                        socket,
                    };

                    peers.set(
                        nodeId,
                        peer
                    );

                    const peerCount =
                        Math.max(
                            0,
                            peers.size - 1
                        );

                    safeSend(
                        socket,
                        {
                            type:
                                "joined",

                            nodeId,

                            peerCount,

                            network:
                                peer.network,

                            protocol:
                                "NCCP-0.2",

                            timestamp:
                                Date.now(),
                        }
                    );

                    /*
                     * Inform existing peers,
                     * but do not force them to
                     * broadcast their whole
                     * blockchain.
                     *
                     * The new node will request
                     * state explicitly.
                     */
                    broadcast(
                        {
                            type:
                                "peer-joined",

                            node: {
                                nodeId,

                                walletAddress:
                                    peer.walletAddress,
                            },

                            peerCount,
                        },
                        nodeId
                    );

                    return;
                }

                if (!peer) {
                    safeSend(
                        socket,
                        {
                            type:
                                "error",

                            error:
                                "Join required first.",
                        }
                    );

                    return;
                }

                /*
                ----------------------------------------------------------
                Message forwarding
                ----------------------------------------------------------
                */

                const forwarded = {
                    ...message,

                    /*
                     * Never trust a client-supplied
                     * sender ID.
                     */
                    senderNodeId:
                        peer.nodeId,

                    peerCount:
                        Math.max(
                            0,
                            peers.size - 1
                        ),

                    forwardedAt:
                        Date.now(),
                };

                /*
                 * Targeted message.
                 *
                 * Used primarily for state-response.
                 */
                if (
                    typeof message
                        .recipientNodeId ===
                        "string" &&
                    message
                        .recipientNodeId
                        .trim()
                        .length > 0
                ) {
                    directSend(
                        message
                            .recipientNodeId,

                        forwarded
                    );

                    return;
                }

                /*
                 * Normal broadcast:
                 *
                 * transaction
                 * block
                 */
                broadcast(
                    forwarded,
                    peer.nodeId
                );
            }
        );

        socket.on(
            "close",
            () => {
                if (!peer) {
                    return;
                }

                peers.delete(
                    peer.nodeId
                );

                broadcast({
                    type:
                        "peer-left",

                    nodeId:
                        peer.nodeId,

                    peerCount:
                        Math.max(
                            0,
                            peers.size - 1
                        ),
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