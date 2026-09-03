import { APP_CONFIG } from "./app/config.js";
import { getState } from "./app/store.js";
import "./styles/globals.css";

const app = document.querySelector("#app");

function render() {
    const state = getState();

    app.innerHTML = `
        <div class="nova-shell">

            <header class="nova-header">
                <div class="brand">
                    <span class="brand-symbol">✦</span>
                    <span class="brand-name">NOVA</span>
                </div>

                <div class="network-status">
                    <span class="status-dot"></span>
                    ${state.network.nodeStatus}
                </div>
            </header>

            <main class="nova-main">

                <section class="hero-card">

                    <div class="sparkle sparkle-one">✦</div>
                    <div class="sparkle sparkle-two">✧</div>

                    <p class="eyebrow">
                        ${APP_CONFIG.name.toUpperCase()}
                    </p>

                    <h1>
                        YOUR LITTLE<br />
                        PIECE OF THE<br />
                        NETWORK
                    </h1>

                    <p class="hero-description">
                        A browser-native decentralized payment network
                        where you can actually watch the blockchain work.
                    </p>

                    <button class="primary-button" type="button">
                        ENTER THE NETWORK
                    </button>

                </section>

                <section class="network-card">

                    <div class="section-heading">
                        <span>☁</span>
                        <span>LOCAL NODE</span>
                    </div>

                    <div class="network-grid">

                        <div class="metric">
                            <span class="metric-label">PEERS</span>
                            <strong>${state.network.peerCount}</strong>
                        </div>

                        <div class="metric">
                            <span class="metric-label">BLOCK</span>
                            <strong>${state.network.blockHeight}</strong>
                        </div>

                        <div class="metric">
                            <span class="metric-label">MEMPOOL</span>
                            <strong>${state.network.mempoolSize}</strong>
                        </div>

                        <div class="metric">
                            <span class="metric-label">SYNC</span>
                            <strong>${state.network.synchronization.status}</strong>
                        </div>

                    </div>

                </section>

                <section class="info-card">

                    <div class="barcode">
                        || ||||| ||| |||||| || |||| |
                    </div>

                    <p>
                        ${APP_CONFIG.network.name}
                    </p>

                    <span>
                        Protocol: ${APP_CONFIG.network.protocol}
                    </span>

                </section>

            </main>

            <nav class="bottom-nav">

                <button class="nav-item active">
                    <span>✦</span>
                    <small>HOME</small>
                </button>

                <button class="nav-item">
                    <span>◉</span>
                    <small>NETWORK</small>
                </button>

                <button class="nav-item">
                    <span>◎</span>
                    <small>WALLET</small>
                </button>

                <button class="nav-item">
                    <span>≋</span>
                    <small>ACTIVITY</small>
                </button>

                <button class="nav-item">
                    <span>☁</span>
                    <small>NODE</small>
                </button>

            </nav>

        </div>
    `;
}

render();