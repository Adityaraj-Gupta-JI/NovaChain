import {
    DurableObject,
} from "cloudflare:workers";

/*
|--------------------------------------------------------------------------
| NovaChain Cloudflare Edge Worker
|--------------------------------------------------------------------------
|
| Responsibilities:
|
|   HTTP
|     -> serve Vite-built frontend assets
|
|   /ws
|     -> route WebSocket connections to the NCCP Durable Object
|
| The Worker / Durable Object does NOT own the NovaChain ledger.
| Blockchain state remains inside each browser node.
|
|--------------------------------------------------------------------------
*/

const NETWORK_NAME = "nova-main";
const PROTOCOL_VERSION = "NCCP-0.1";
const HUB_NAME = "nova-main";

function jsonResponse(
    payload,
    status = 200,
) {
    return new Response(
        JSON.stringify(payload, null, 2),
        {
            status,
            headers: {
                "content-type":
                    "application/json; charset=utf-8",
                "cache-control":
                    "no-store",
            },
        },
    );
}

function isWebSocketRequest(
    request,
) {
    return (
        request.headers.get(
            "Upgrade",
        )?.toLowerCase() ===
        "websocket"
    );
}

export default {
    async fetch(
        request,
        env,
    ) {
        const url = new URL(
            request.url,
        );

        /*
         * Health endpoint.
         *
         * Useful for deployment checks without exposing
         * any blockchain state.
         */
        if (
            request.method === "GET" &&
            url.pathname === "/api/health"
        ) {
            return jsonResponse({
                service: "NovaChain",
                component: "Cloudflare Edge",
                status: "online",
                network: NETWORK_NAME,
                protocol: PROTOCOL_VERSION,
                timestamp: Date.now(),
            });
        }

        /*
         * NCCP WebSocket endpoint.
         *
         * All clients in nova-main enter the same Durable Object,
         * allowing the object to coordinate currently connected peers.
         */
        if (
            url.pathname === "/ws" &&
            isWebSocketRequest(request)
        ) {
            const id =
                env.NCCP_HUB.idFromName(
                    HUB_NAME,
                );

            const stub =
                env.NCCP_HUB.get(
                    id,
                );

            return stub.fetch(
                new Request(
                    request,
                    {
                        headers:
                            new Headers(
                                request.headers,
                            ),
                    },
                ),
            );
        }

        /*
         * Everything else is a frontend/static asset request.
         */
        return env.ASSETS.fetch(
            request,
        );
    },
};

/*
|--------------------------------------------------------------------------
| NCCP Hub Durable Object
|--------------------------------------------------------------------------
|
| One Durable Object instance coordinates the connected browser nodes
| of the nova-main network.
|
| It forwards protocol messages but does not validate, mine, or persist
| the NovaChain blockchain.
|
| WebSocket Hibernation is used so idle connections do not require the
| Durable Object JavaScript isolate to remain continuously active.
|
|--------------------------------------------------------------------------
*/

export class NCCPHub extends DurableObject {
    constructor(
        ctx,
        env,
    ) {
        super(
            ctx,
            env,
        );

        this.ctx = ctx;
        this.env = env;

        /*
         * Hibernation is preferred for Durable Object WebSocket servers.
         *
         * Auto-response lets the platform answer websocket ping/pong
         * traffic without waking the object for application messages.
         */
        this.ctx.setWebSocketAutoResponse(
            new WebSocketRequestResponsePair(
                "ping",
                "pong",
            ),
        );
    }

    async fetch(
        request,
    ) {
        if (
            !isWebSocketRequest(
                request,
            )
        ) {
            return jsonResponse(
                {
                    error:
                        "NCCP Hub expects a WebSocket connection.",
                    endpoint:
                        "/ws",
                },
                426,
            );
        }

        const pair =
            new WebSocketPair();

        const client =
            pair[0];

        const server =
            pair[1];

        /*
         * Accept through Durable Object context so the WebSocket
         * participates in the Hibernation API.
         */
        this.ctx.acceptWebSocket(
            server,
        );

        /*
         * Every socket starts as anonymous until it sends "join".
         */
        server.serializeAttachment(
            {
                nodeId: null,
                walletAddress: null,
                network: NETWORK_NAME,
                joined: false,
            },
        );

        return new Response(
            null,
            {
                status: 101,
                webSocket: client,
            },
        );
    }

    webSocketMessage(
        socket,
        rawMessage,
    ) {
        const message =
            this.parseMessage(
                rawMessage,
            );

        if (!message) {
            this.safeSend(
                socket,
                {
                    type: "error",
                    error:
                        "Invalid NCCP message.",
                    protocol:
                        PROTOCOL_VERSION,
                    timestamp: Date.now(),
                },
            );

            return;
        }

        if (
            message.type ===
            "join"
        ) {
            this.handleJoin(
                socket,
                message,
            );

            return;
        }

        const peer =
            this.getPeer(
                socket,
            );

        if (
            !peer?.joined
        ) {
            this.safeSend(
                socket,
                {
                    type: "error",
                    error:
                        "Join the NovaChain network first.",
                    protocol:
                        PROTOCOL_VERSION,
                    timestamp: Date.now(),
                },
            );

            return;
        }

        /*
         * Keep the edge layer intentionally dumb:
         * after a node has joined, forward NCCP messages.
         *
         * The browsers perform blockchain validation.
         */
        this.broadcast(
            {
                ...message,
                senderNodeId:
                    peer.nodeId ??
                    message.senderNodeId ??
                    null,
                forwardedAt:
                    Date.now(),
                protocol:
                    message.protocol ??
                    PROTOCOL_VERSION,
            },
            socket,
        );
    }

    webSocketClose(
        socket,
        code,
        reason,
        wasClean,
    ) {
        const peer =
            this.getPeer(
                socket,
            );

        if (
            peer?.joined &&
            peer.nodeId
        ) {
            this.broadcast(
                {
                    type:
                        "peer-left",
                    nodeId:
                        peer.nodeId,
                    peerCount:
                        this.getPeerCount() -
                        1,
                    protocol:
                        PROTOCOL_VERSION,
                    timestamp:
                        Date.now(),
                },
                socket,
            );
        }

        /*
         * Closing is handled by the platform. We only emit the peer
         * departure notification above.
         */
        console.debug(
            "NovaChain NCCP socket closed.",
            {
                code,
                reason,
                wasClean,
                nodeId:
                    peer?.nodeId ??
                    null,
            },
        );
    }

    webSocketError(
        socket,
        error,
    ) {
        const peer =
            this.getPeer(
                socket,
            );

        console.error(
            "NovaChain NCCP WebSocket error.",
            {
                nodeId:
                    peer?.nodeId ??
                    null,
                error,
            },
        );
    }

    handleJoin(
        socket,
        message,
    ) {
        const currentPeer =
            this.getPeer(
                socket,
            );

        const nodeId =
            typeof message.nodeId ===
                "string" &&
            message.nodeId.length > 0
                ? message.nodeId
                : null;

        if (!nodeId) {
            this.safeSend(
                socket,
                {
                    type: "error",
                    error:
                        "A nodeId is required.",
                    protocol:
                        PROTOCOL_VERSION,
                    timestamp: Date.now(),
                },
            );

            try {
                socket.close(
                    1008,
                    "Missing nodeId.",
                );
            } catch {
                // Ignore close failures.
            }

            return;
        }

        const existingSocket =
            this.findSocketByNodeId(
                nodeId,
                socket,
            );

        if (existingSocket) {
            this.safeSend(
                socket,
                {
                    type: "error",
                    error:
                        "Node ID is already connected.",
                    nodeId,
                    protocol:
                        PROTOCOL_VERSION,
                    timestamp:
                        Date.now(),
                },
            );

            try {
                socket.close(
                    1008,
                    "Duplicate node ID.",
                );
            } catch {
                // Ignore close failures.
            }

            return;
        }

        const peer = {
            nodeId,
            walletAddress:
                typeof message.walletAddress ===
                    "string"
                    ? message.walletAddress
                    : null,
            network:
                typeof message.network ===
                    "string"
                    ? message.network
                    : NETWORK_NAME,
            joined: true,
        };

        /*
         * Attachment survives WebSocket hibernation and gives us
         * enough metadata to identify the socket when it wakes again.
         */
        socket.serializeAttachment(
            peer,
        );

        const peerCount =
            this.getPeerCount();

        this.safeSend(
            socket,
            {
                type: "joined",
                nodeId,
                network:
                    peer.network,
                peerCount,
                protocol:
                    PROTOCOL_VERSION,
                timestamp:
                    Date.now(),
            },
        );

        this.broadcast(
            {
                type:
                    "peer-joined",
                node: {
                    nodeId,
                    walletAddress:
                        peer.walletAddress,
                },
                peerCount,
                protocol:
                    PROTOCOL_VERSION,
                timestamp:
                    Date.now(),
            },
            socket,
        );

        if (currentPeer) {
            /*
             * This is intentionally not used to overwrite the peer's
             * identity except through serializeAttachment above.
             */
            console.debug(
                "NovaChain peer refreshed.",
                {
                    nodeId,
                },
            );
        }
    }

    parseMessage(
        rawMessage,
    ) {
        try {
            if (
                typeof rawMessage ===
                "string"
            ) {
                const parsed =
                    JSON.parse(
                        rawMessage,
                    );

                return parsed &&
                    typeof parsed ===
                        "object"
                    ? parsed
                    : null;
            }

            if (
                rawMessage instanceof
                ArrayBuffer
            ) {
                const text =
                    new TextDecoder().decode(
                        rawMessage,
                    );

                const parsed =
                    JSON.parse(
                        text,
                    );

                return parsed &&
                    typeof parsed ===
                        "object"
                    ? parsed
                    : null;
            }

            return null;
        } catch {
            return null;
        }
    }

    getPeer(
        socket,
    ) {
        try {
            return (
                socket.deserializeAttachment?.() ??
                null
            );
        } catch {
            return null;
        }
    }

    getSockets() {
        return this.ctx.getWebSockets();
    }

    getPeerCount() {
        return this.getSockets()
            .filter(
                (socket) =>
                    this.getPeer(
                        socket,
                    )?.joined,
            )
            .length;
    }

    findSocketByNodeId(
        nodeId,
        ignoredSocket = null,
    ) {
        for (
            const socket of this.getSockets()
        ) {
            if (
                socket ===
                ignoredSocket
            ) {
                continue;
            }

            const peer =
                this.getPeer(
                    socket,
                );

            if (
                peer?.joined &&
                peer.nodeId ===
                    nodeId
            ) {
                return socket;
            }
        }

        return null;
    }

    broadcast(
        payload,
        excludedSocket = null,
    ) {
        const serialized =
            JSON.stringify(
                payload,
            );

        for (
            const socket of this.getSockets()
        ) {
            if (
                socket ===
                excludedSocket
            ) {
                continue;
            }

            const peer =
                this.getPeer(
                    socket,
                );

            if (
                !peer?.joined
            ) {
                continue;
            }

            try {
                socket.send(
                    serialized,
                );
            } catch (
                error
            ) {
                console.warn(
                    "NovaChain failed to forward NCCP message.",
                    error,
                );
            }
        }
    }

    safeSend(
        socket,
        payload,
    ) {
        try {
            socket.send(
                JSON.stringify(
                    payload,
                ),
            );
        } catch (
            error
        ) {
            console.warn(
                "NovaChain failed to send NCCP response.",
                error,
            );
        }
    }
}