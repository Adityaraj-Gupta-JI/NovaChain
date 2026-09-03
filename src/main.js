import "./styles/globals.css";

import { getNodeIdentity } from "./core/identity/nodeIdentity.js";
import { createWallet } from "./core/wallet/wallet.js";
import { networkState } from "./core/state/networkState.js";
import { renderDashboard } from "./pages/dashboard.js";

async function bootNovaChain() {
    const root = document.querySelector("#app");

    if (!root) {
        throw new Error("NovaChain mount point #app was not found.");
    }

    renderBootScreen(root);

    try {
        // -----------------------------------------------------
        // 1. Load persistent node identity
        // -----------------------------------------------------
        const nodeIdentity = getNodeIdentity();

        // -----------------------------------------------------
        // 2. Initialize local blockchain/network state
        // -----------------------------------------------------
        await networkState.initialize();

        // -----------------------------------------------------
        // 3. Create the browser wallet
        // -----------------------------------------------------
        const wallet = await createWallet();

        // -----------------------------------------------------
        // 4. Mount the actual NovaChain application
        // -----------------------------------------------------
        renderDashboard({
            root,
            nodeIdentity,
            wallet,
            networkState,
        });
    } catch (error) {
        console.error("NovaChain boot failed:", error);

        renderBootError(root, error);
    }
}

function renderBootScreen(root) {
    root.innerHTML = `
        <div class="nova-shell">
            <main class="nova-main">
                <section class="hero-card">
                    <span class="sparkle sparkle-one">✦</span>
                    <span class="sparkle sparkle-two">✹</span>

                    <p class="eyebrow">
                        NOVACHAIN // NODE BOOT
                    </p>

                    <h1>
                        Waking<br>
                        the node.
                    </h1>

                    <p class="hero-description">
                        Loading your browser identity, local ledger and wallet.
                    </p>

                    <div class="badge green">
                        ● INITIALIZING
                    </div>
                </section>
            </main>
        </div>
    `;
}

function renderBootError(root, error) {
    const message =
        error instanceof Error
            ? error.message
            : String(error);

    root.innerHTML = `
        <div class="nova-shell">
            <main class="nova-main">
                <section class="hero-card">
                    <span class="sparkle sparkle-one">!</span>

                    <p class="eyebrow">
                        NOVACHAIN // BOOT FAILURE
                    </p>

                    <h1>
                        Node<br>
                        offline.
                    </h1>

                    <p class="hero-description">
                        NovaChain could not initialize the local node.
                        The technical error is shown below.
                    </p>

                    <div class="tech-panel">
                        <div class="section-heading">
                            <span>⌘</span>
                            <span>BOOT ERROR</span>
                        </div>

                        <pre>${escapeHtml(message)}</pre>
                    </div>

                    <button
                        class="primary-button"
                        type="button"
                        id="retry-node"
                    >
                        Retry Node
                    </button>
                </section>
            </main>
        </div>
    `;

    root.querySelector("#retry-node")?.addEventListener("click", () => {
        window.location.reload();
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

bootNovaChain();