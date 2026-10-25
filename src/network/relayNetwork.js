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

        this.rtcPeers = new Map();
        this.knownPeers = new Map();
        this.rtcSupported = typeof RTCPeerConnection !== "undefined";
        this.rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
        this.joined = false;
        this.presenceTimer = null;
        this.lastRosterUpdate = 0;
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

                this.startPresenceRefresh();
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
                this.joined = false;
                this.stopPresenceRefresh();
                this.resetPeers();

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
        this.stopPresenceRefresh();
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

        this.statusSnapshot.peerCount = 0;
        this.setStatus(
            "OFFLINE"
        );
    }

    send(message) {
        const payload = { ...message, senderNodeId: this.nodeId,
            protocol: message.protocol ?? "NCCP-0.1" };
        // Signaling always travels over the hub; application traffic uses RTC where ready.
        const signaling = payload.type === "rtc-signal";
        const target = payload.recipientNodeId;
        const direct = [];
        if (!signaling) {
            for (const [id, peer] of this.rtcPeers) {
                if (target && target !== id) continue;
                if (peer.channel?.readyState === "open") {
                    try { peer.channel.send(JSON.stringify(payload)); direct.push(id); }
                    catch (error) { console.warn("RTC send failed", error); }
                }
            }
        }
        // Targeted messages do not need a second copy when sent directly.
        if (target && direct.includes(target)) return true;
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return direct.length > 0;
        try {
            this.socket.send(JSON.stringify({ ...payload,
                // Hub skips peers already reached directly; no duplicate block processing.
                excludeNodeIds: signaling ? [] : direct }));
            return true;
        } catch (error) { console.error("NovaChain network send failed:", error); return direct.length > 0; }
    }

    resetPeers() {
        for (const peer of this.rtcPeers.values()) {
            try { peer.channel?.close(); peer.pc.close(); } catch {}
        }
        this.rtcPeers.clear();
        this.knownPeers.clear();
        this.publishPresence();
    }

    // Authoritative roster refresh repairs missed join/leave events and
    // supports workers resuming after Durable Object hibernation.
    startPresenceRefresh() {
        this.stopPresenceRefresh();
        this.presenceTimer = setInterval(() => {
            if (this.connected && this.joined) this.requestPeers();
        }, 5000);
    }

    stopPresenceRefresh() {
        if (this.presenceTimer) clearInterval(this.presenceTimer);
        this.presenceTimer = null;
    }

    requestPeers() {
        return this.send({ type: "peers-request" });
    }

    reconcileRoster(message) {
        if (!Array.isArray(message.peers)) return;
        const next = new Map();
        for (const peer of message.peers) {
            if (typeof peer?.nodeId === "string" && peer.nodeId && peer.nodeId !== this.nodeId)
                next.set(peer.nodeId, peer);
        }
        for (const nodeId of this.knownPeers.keys()) {
            if (!next.has(nodeId)) this.dropRtcPeer(nodeId);
        }
        this.knownPeers = next;
        this.lastRosterUpdate = Date.now();
        this.publishPresence();
        // Reconcile is also a recovery loop. Failed or closed WebRTC sessions
        // are retried when the authoritative roster still lists the peer.
        for (const id of next.keys()) {
            const peer = this.rtcPeers.get(id);
            if (peer && ["failed", "closed"].includes(peer.pc.connectionState)) {
                this.dropRtcPeer(id);
            }
            if (!this.rtcPeers.has(id) && String(this.nodeId) < String(id)) {
                this.ensureRtcPeer(id, true);
            }
        }
    }

    publishPresence() {
        this.statusSnapshot = { ...this.statusSnapshot,
            peerCount: this.connected && this.joined ? this.knownPeers.size : 0,
            totalNodeCount: this.connected && this.joined ? this.knownPeers.size + 1 : 0,
            directPeerCount: [...this.rtcPeers.values()].filter(p => p.channel?.readyState === "open").length,
            transport: "WebRTC + WebSocket fallback",
            peers: [...this.knownPeers.keys()],
            joined: this.joined,
            lastRosterUpdate: this.lastRosterUpdate };
        this.onStatus?.(this.statusSnapshot);
    }

    ensureRtcPeer(nodeId, initiator = false) {
        if (!this.rtcSupported || !nodeId || nodeId === this.nodeId) return null;
        if (this.rtcPeers.has(nodeId)) return this.rtcPeers.get(nodeId);
        const pc = new RTCPeerConnection(this.rtcConfig);
        const peer = { pc, channel: null, nodeId };
        this.rtcPeers.set(nodeId, peer);
        pc.onicecandidate = (event) => {
            if (event.candidate) this.send({ type: "rtc-signal", recipientNodeId: nodeId,
                signal: { candidate: event.candidate.toJSON() } });
        };
        pc.onconnectionstatechange = () => {
            if (["failed", "closed"].includes(pc.connectionState)) {
                this.dropRtcPeer(nodeId);
            }
            this.publishPresence();
        };
        pc.ondatachannel = (event) => this.bindRtcChannel(nodeId, event.channel);
        if (initiator) {
            this.bindRtcChannel(nodeId, pc.createDataChannel("nccp", { ordered: true }));
            pc.createOffer().then(offer => pc.setLocalDescription(offer))
                .then(() => this.send({ type: "rtc-signal", recipientNodeId: nodeId,
                    signal: { description: pc.localDescription.toJSON() } }))
                .catch(error => console.warn("RTC offer failed", error));
        }
        return peer;
    }

    bindRtcChannel(nodeId, channel) {
        const peer = this.rtcPeers.get(nodeId);
        if (!peer) { channel.close(); return; }
        peer.channel = channel;
        channel.onopen = () => { this.publishPresence(); this.requestState(); };
        channel.onclose = () => {
            this.publishPresence();
            // Ask for an authoritative roster instead of assuming the peer left.
            // The next roster will rebuild a failed peer connection.
            if (this.connected && this.joined) this.requestPeers();
        };
        channel.onerror = () => this.publishPresence();
        channel.onmessage = event => this.handleMessage(event.data, true);
    }

    dropRtcPeer(nodeId) {
        const peer = this.rtcPeers.get(nodeId);
        if (!peer) return;
        this.rtcPeers.delete(nodeId);
        try { peer.channel?.close(); peer.pc.close(); } catch {}
        this.publishPresence();
    }

    async handleRtcSignal(message) {
        const nodeId = message.senderNodeId;
        if (!nodeId || nodeId === this.nodeId || !message.signal) return;
        try {
            const signal = message.signal;
            const peer = this.ensureRtcPeer(nodeId, false);
            if (!peer) return;
            if (signal.description) {
                await peer.pc.setRemoteDescription(signal.description);
                if (signal.description.type === "offer") {
                    const answer = await peer.pc.createAnswer();
                    await peer.pc.setLocalDescription(answer);
                    this.send({ type: "rtc-signal", recipientNodeId: nodeId,
                        signal: { description: peer.pc.localDescription.toJSON() } });
                }
                // Apply ICE candidates that arrived before the remote description.
                for (const candidate of peer.pendingCandidates ?? []) await peer.pc.addIceCandidate(candidate);
                peer.pendingCandidates = [];
            } else if (signal.candidate) {
                if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(signal.candidate);
                else (peer.pendingCandidates ??= []).push(signal.candidate);
            }
        } catch (error) { console.warn("RTC negotiation failed", nodeId, error); }
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

        if (message.type === "rtc-signal") {
            if (message.recipientNodeId === this.nodeId) void this.handleRtcSignal(message);
            return;
        }
        if (message.type === "joined") {
            this.joined = true;
            this.reconcileRoster(message);
            this.requestPeers();
        } else if (message.type === "peers-snapshot") {
            this.reconcileRoster(message);
        } else if (message.type === "peer-joined") {
            const peer = message.node;
            if (peer?.nodeId && peer.nodeId !== this.nodeId) {
                this.knownPeers.set(peer.nodeId, peer);
                if (String(this.nodeId) < String(peer.nodeId)) this.ensureRtcPeer(peer.nodeId, true);
            }
            this.publishPresence();
        } else if (message.type === "peer-left") {
            this.knownPeers.delete(message.nodeId);
            this.dropRtcPeer(message.nodeId);
            this.publishPresence();
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