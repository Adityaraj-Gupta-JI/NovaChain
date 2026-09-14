import "./styles/globals.css";

import {
    getNodeIdentity,
} from "./core/identity/nodeIdentity.js";

import {
    createWallet,
} from "./core/wallet/wallet.js";

import {
    networkState,
} from "./core/state/networkState.js";

import {
    renderDashboard,
} from "./pages/dashboard.js";

import {
    RelayNetwork,
    getDefaultSignalingUrl,
} from "./network/relayNetwork.js";

async function bootNovaChain() {
    const root =
        document.querySelector(
            "#app"
        );

    if (!root) {
        throw new Error(
            "NovaChain mount point #app was not found."
        );
    }

    root.innerHTML = `
        <div class="nova-shell">
            <main class="nova-main">
                <section class="hero-card">
                    <p class="eyebrow">
                        NOVACHAIN // BOOTING NODE
                    </p>

                    <h1>
                        Loading<br>
                        the network.
                    </h1>

                    <p class="hero-description">
                        Initializing node identity,
                        wallet, local ledger and
                        NCCP transport.
                    </p>
                </section>
            </main>
        </div>
    `;

    try {
        const nodeIdentity =
            getNodeIdentity();

        /*
         * Wallet is persistent and must
         * be loaded before networking so
         * its address is available during
         * the node join.
         */
        const wallet =
            await createWallet();

        /*
         * Restore the local ledger BEFORE
         * connecting to peers.
         */
        await networkState.initialize();

        const network =
            new RelayNetwork({
                nodeId:
                    nodeIdentity.nodeId,

                walletAddress:
                    wallet.address,

                signalingUrl:
                    getDefaultSignalingUrl(),

                onStatus:
                    (
                        status
                    ) => {
                        window.dispatchEvent(
                            new CustomEvent(
                                "novachain:network-status",
                                {
                                    detail:
                                        status,
                                }
                            )
                        );
                    },

                onMessage:
                    async (
                        message
                    ) => {
                        switch (
                            message.type
                        ) {
                            /*
                            ------------------------------------------------
                            Node joined network
                            ------------------------------------------------
                            */

                            case "joined":
                                /*
                                 * Give other peers a
                                 * moment to finish seeing
                                 * this node before the
                                 * state request.
                                 */
                                window.setTimeout(
                                    () => {
                                        network.requestState();
                                    },
                                    250
                                );

                                break;

                            /*
                            ------------------------------------------------
                            Peer joined
                            ------------------------------------------------
                            */

                            case "peer-joined":
                                /*
                                 * No full-state broadcast
                                 * here.
                                 *
                                 * New peers request state
                                 * themselves.
                                 */
                                break;

                            /*
                            ------------------------------------------------
                            Peer left
                            ------------------------------------------------
                            */

                            case "peer-left":
                                break;

                            /*
                            ------------------------------------------------
                            State request
                            ------------------------------------------------
                            */

                            case "state-request":
                                if (
                                    message.senderNodeId &&
                                    message.senderNodeId !==
                                        nodeIdentity.nodeId
                                ) {
                                    network.sendStateTo(
                                        message
                                            .senderNodeId,

                                        networkState
                                            .getStateSnapshot()
                                    );
                                }

                                break;

                            /*
                            ------------------------------------------------
                            State response
                            ------------------------------------------------
                            */

                            case "state-response":
                                if (
                                    !message
                                        .recipientNodeId ||
                                    message
                                        .recipientNodeId ===
                                        nodeIdentity.nodeId
                                ) {
                                    await networkState
                                        .adoptRemoteState(
                                            message.state
                                        );
                                }

                                break;

                            /*
                            ------------------------------------------------
                            Remote transaction
                            ------------------------------------------------
                            */

                            case "transaction":
                                await networkState
                                    .receiveRemoteTransaction(
                                        message.transaction
                                    );

                                break;

                            /*
                            ------------------------------------------------
                            Remote block
                            ------------------------------------------------
                            */

                            case "block":
                                await networkState
                                    .addExternalBlock(
                                        message.block
                                    );

                                break;

                            default:
                                break;
                        }
                    },
            });

        networkState.attachNetworkTransport(
            network
        );

        /*
         * Connect only after the local node
         * and wallet are ready.
         */
        network.connect();

        renderDashboard({
            root,
            nodeIdentity,
            wallet,
            networkState,
        });
    } catch (
        error
    ) {
        console.error(
            "NovaChain boot failed:",
            error
        );

        root.innerHTML = `
            <div class="nova-shell">
                <main class="nova-main">
                    <section class="hero-card">
                        <p class="eyebrow">
                            NOVACHAIN // BOOT ERROR
                        </p>

                        <h1>
                            Node<br>
                            offline.
                        </h1>

                        <p class="hero-description">
                            NovaChain could not initialize
                            the node. Open the browser console
                            for the technical error.
                        </p>

                        <button
                            class="primary-button"
                            type="button"
                            onclick="location.reload()"
                        >
                            RETRY NODE
                        </button>
                    </section>
                </main>
            </div>
        `;
    }
}

bootNovaChain();