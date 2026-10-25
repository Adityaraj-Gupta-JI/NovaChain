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
        port: PORT,
    });

const peers =
    new Map();

function safeSend(
    socket,
    payload
) {
    if (
        socket.readyState ===
        socket.OPEN
    ) {
        socket.send(
            JSON.stringify(
                payload
            )
        );
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
        let peerRecord =
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
                |--------------------------------------------------------------------------
                | JOIN
                |--------------------------------------------------------------------------
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

                        socket,
                    };

                    peers.set(
                        nodeId,
                        peerRecord
                    );

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
                     * Tell existing peers that a new node joined.
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
                |--------------------------------------------------------------------------
                | REQUIRE JOIN
                |--------------------------------------------------------------------------
                */

                if (
                    !peerRecord
                ) {
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
                |--------------------------------------------------------------------------
                | NCCP FORWARDING
                |--------------------------------------------------------------------------
                |
                | The relay never stores blockchain state.
                |
                | recipientNodeId:
                |   targeted delivery
                |
                | otherwise:
                |   broadcast to current peers
                |--------------------------------------------------------------------------
                */

                const payload = {
                    ...message,

                    forwardedAt:
                        Date.now(),
                };

                if (
                    typeof message.recipientNodeId ===
                        "string" &&
                    message.recipientNodeId.length >
                        0
                ) {
                    const recipient =
                        peers.get(
                            message.recipientNodeId
                        );

                    if (
                        recipient
                    ) {
                        safeSend(
                            recipient.socket,
                            payload
                        );
                    }

                    return;
                }

                broadcast(
                    payload,
                    socket
                );
            }
        );

        socket.on(
            "close",
            () => {
                if (
                    !peerRecord
                ) {
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