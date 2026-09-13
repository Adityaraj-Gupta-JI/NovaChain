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
                        local ledger, wallet and
                        live NCCP transport.
                    </p>
                </section>
            </main>
        </div>
    `;

    try {
        /*
         * Persistent node identity.
         */
        const nodeIdentity =
            getNodeIdentity();

        /*
         * Persistent wallet.
         */
        const wallet =
            await createWallet();

        /*
         * Initialize local blockchain,
         * UTXO state and IndexedDB.
         */
        await networkState.initialize();

        /*
         * Determine the NCCP relay.
         *
         * Development default:
         * ws://localhost:8787
         *
         * Production:
         * VITE_NOVACHAIN_SIGNALING_URL
         */
        const signalingUrl =
            getDefaultSignalingUrl();

        /*
         * Create live network transport.
         */
        const network =
            new RelayNetwork({
                nodeId:
                    nodeIdentity.nodeId,

                walletAddress:
                    wallet.address,

                signalingUrl,

                /*
                 * Incoming NCCP messages.
                 */
                onMessage:
                    async (
                        message
                    ) => {
                        switch (
                            message.type
                        ) {
                            /*
                             * This node has joined
                             * the relay.
                             *
                             * Ask peers for their
                             * current chain state.
                             */
                            case "joined":
                                window.setTimeout(
                                    () => {
                                        network.requestState();
                                    },
                                    150
                                );

                                break;

                            /*
                             * A new node joined.
                             *
                             * Existing nodes advertise
                             * their current state.
                             */
                            case "peer-joined":
                                network.broadcastState(
                                    networkState.getStateSnapshot()
                                );

                                break;

                            /*
                             * Another node asks for
                             * current ledger state.
                             */
                            case "state-request":
                                network.broadcastState(
                                    networkState.getStateSnapshot()
                                );

                                break;

                            /*
                             * Receive a longer chain/
                             * current UTXO snapshot.
                             */
                            case "state-response":
                                await networkState.adoptRemoteState(
                                    message.state
                                );

                                break;

                            /*
                             * Receive a transaction
                             * from another node.
                             */
                            case "transaction":
                                await networkState.receiveRemoteTransaction(
                                    message.transaction
                                );

                                break;

                            /*
                             * Receive a mined block
                             * from another node.
                             */
                            case "block":
                                await networkState.addExternalBlock(
                                    message.block
                                );

                                break;

                            default:
                                break;
                        }
                    },

                /*
                 * Status callback is available
                 * for future dashboard telemetry.
                 */
                onStatus:
                    (status) => {
                        console.debug(
                            "NovaChain NCCP status:",
                            status
                        );
                    },
            });

        /*
         * Give NetworkState the transport
         * used for broadcasting.
         */
        networkState.attachNetworkTransport(
            network
        );

        /*
         * Connect to NCCP relay.
         */
        network.connect();

        /*
         * Finally render the real dashboard.
         */
        renderDashboard({
            root,
            nodeIdentity,
            wallet,
            networkState,
        });
    } catch (error) {
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
                            the node. Open the browser
                            console for the technical error.
                        </p>

                        <button
                            class="primary-button"
                            type="button"
                            onclick="location.reload()"
                        >
                            Retry Node
                        </button>
                    </section>
                </main>
            </div>
        `;
    }
}

bootNovaChain();