import { getBalance } from "../core/transaction/utxo.js";

const NNC_PER_NVC = 1_000_000;

/* =========================================================
   FORMATTING
   ========================================================= */

function formatNVC(amount) {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount)) {
        return "0.000000";
    }

    return (numericAmount / NNC_PER_NVC).toFixed(6);
}

function shortHash(value, start = 8, end = 6) {
    if (!value) {
        return "—";
    }

    const stringValue = String(value);

    if (stringValue.length <= start + end + 3) {
        return stringValue;
    }

    return `${stringValue.slice(0, start)}…${stringValue.slice(-end)}`;
}

function formatNodeId(value) {
    if (!value) {
        return "UNKNOWN";
    }

    return shortHash(value, 8, 5).toUpperCase();
}

function formatDate(timestamp) {
    if (!timestamp) {
        return "—";
    }

    try {
        return new Date(timestamp).toLocaleString();
    } catch {
        return "—";
    }
}

function makeBarcode(seed) {
    if (!seed) {
        return "|||| ||| |||||| || |||";
    }

    const source = String(seed);

    return Array.from({ length: 42 }, (_, index) => {
        const code = source.charCodeAt(index % source.length);

        if (code % 5 === 0) {
            return "|||";
        }

        if (code % 3 === 0) {
            return "||";
        }

        if (code % 2 === 0) {
            return "|";
        }

        return " ";
    }).join("");
}

/* =========================================================
   STATE
   ========================================================= */

function getSnapshot(networkState) {
    return networkState.getStateSnapshot();
}

function getWalletBalance(snapshot, wallet) {
    return getBalance(snapshot.utxos, wallet.address);
}

/* =========================================================
   HTML HELPERS
   ========================================================= */

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderMempoolActivity(snapshot) {
    if (!snapshot.mempool || snapshot.mempool.length === 0) {
        return `
            <div class="empty-state">
                <strong>THE NETWORK IS QUIET.</strong>
                <span>
                    Create a transaction to activate the pipeline.
                </span>
            </div>
        `;
    }

    return snapshot.mempool
        .slice(-5)
        .reverse()
        .map((transaction) => {
            const outputTotal =
                transaction.outputs?.reduce(
                    (sum, output) => sum + Number(output.amount || 0),
                    0,
                ) ?? 0;

            return `
                <div class="activity-row">
                    <div class="activity-icon">
                        TX
                    </div>

                    <div class="row-main">
                        <div class="row-title">
                            Payment waiting in mempool
                        </div>

                        <div class="row-meta">
                            ${shortHash(transaction.id)}
                        </div>
                    </div>

                    <div class="row-value">
                        ${formatNVC(outputTotal)} NVC
                    </div>
                </div>
            `;
        })
        .join("");
}

function renderLatestBlock(latestBlock) {
    if (!latestBlock) {
        return `
            <div class="empty-state">
                <strong>NO BLOCK DATA</strong>
                <span>
                    The local chain has not produced a block yet.
                </span>
            </div>
        `;
    }

    return `
        <div class="block-list">
            <div class="block-row">
                <div class="block-icon">
                    #
                </div>

                <div class="row-main">
                    <div class="row-title">
                        BLOCK ${String(latestBlock.index).padStart(5, "0")}
                    </div>

                    <div class="row-meta">
                        ${shortHash(latestBlock.hash, 10, 8)}
                    </div>
                </div>

                <div class="row-value">
                    ${latestBlock.transactions?.length ?? 0} TX
                </div>
            </div>

            <div class="metric">
                <span class="metric-label">
                    DIFFICULTY
                </span>

                <strong>
                    ${latestBlock.difficulty ?? 0}
                </strong>
            </div>

            <div class="metric">
                <span class="metric-label">
                    NONCE
                </span>

                <strong>
                    ${latestBlock.nonce ?? 0}
                </strong>
            </div>

            <div class="metric">
                <span class="metric-label">
                    MINED
                </span>

                <strong>
                    ${formatDate(latestBlock.timestamp)}
                </strong>
            </div>
        </div>
    `;
}

/* =========================================================
   MAIN RENDER
   ========================================================= */

function render(root, context) {
    const {
        nodeIdentity,
        wallet,
        networkState,
    } = context;

    const snapshot = getSnapshot(networkState);

    const balance = getWalletBalance(
        snapshot,
        wallet,
    );

    const latestBlock =
        snapshot.blocks[
            snapshot.blocks.length - 1
        ];

    const hasMempoolTransactions =
        snapshot.mempool.length > 0;

    root.innerHTML = `
        <div class="nova-shell">

            <!-- =================================================
                 HEADER
                 ================================================= -->

            <header class="nova-header">

                <div class="brand">
                    <div class="brand-symbol">
                        ✦
                    </div>

                    <div class="brand-name">
                        NOVACHAIN
                    </div>
                </div>

                <div
                    class="network-status"
                    aria-label="Network status"
                >
                    <span class="status-dot"></span>

                    LOCAL NODE ONLINE
                </div>

            </header>


            <!-- =================================================
                 MAIN APPLICATION
                 ================================================= -->

            <main class="nova-main" id="nova-top">

                <!-- =================================================
                     HERO
                     ================================================= -->

                <section class="hero-card">

                    <span class="sparkle sparkle-one">
                        ✦
                    </span>

                    <span class="sparkle sparkle-two">
                        ✹
                    </span>

                    <p class="eyebrow">
                        BROWSER-NATIVE DECENTRALIZED NETWORK
                    </p>

                    <h1>
                        Learn blockchain
                        by watching it work.
                    </h1>

                    <p class="hero-description">
                        Your browser is the node.
                        Transactions enter the mempool,
                        miners search for Proof of Work,
                        blocks are validated,
                        and the ledger changes in front of you.
                    </p>

                    <button
                        class="primary-button"
                        type="button"
                        data-scroll="network"
                    >
                        Explore My Node ↓
                    </button>

                </section>


                <!-- =================================================
                     BALANCE
                     ================================================= -->

                <section
                    class="balance-card"
                    aria-label="Wallet balance"
                >

                    <p class="balance-label">
                        AVAILABLE BALANCE
                    </p>

                    <p class="balance-value">
                        ${formatNVC(balance)}
                    </p>

                    <div class="balance-currency">
                        NVC // NOVACOIN
                    </div>

                </section>


                <!-- =================================================
                     ACTIONS
                     ================================================= -->

                <section
                    class="action-grid"
                    aria-label="Wallet actions"
                >

                    <button
                        class="action-tile"
                        type="button"
                        data-action="send"
                    >
                        <span class="action-tile-icon">
                            ↗
                        </span>

                        <span class="action-tile-label">
                            Send
                        </span>
                    </button>

                    <button
                        class="action-tile"
                        type="button"
                        data-action="mine"
                    >
                        <span class="action-tile-icon">
                            ⛏
                        </span>

                        <span class="action-tile-label">
                            Mine
                        </span>
                    </button>

                    <button
                        class="action-tile"
                        type="button"
                        data-action="receive"
                    >
                        <span class="action-tile-icon">
                            ↓
                        </span>

                        <span class="action-tile-label">
                            Receive
                        </span>
                    </button>

                </section>


                <!-- =================================================
                     NODE TELEMETRY
                     ================================================= -->

                <section
                    class="network-card"
                    id="network"
                >

                    <div class="section-heading">
                        <span>◆</span>
                        <span>NODE TELEMETRY</span>
                    </div>

                    <div class="network-grid">

                        <div class="metric">
                            <span class="metric-label">
                                CHAIN HEIGHT
                            </span>

                            <strong>
                                ${snapshot.chainHeight}
                            </strong>
                        </div>

                        <div class="metric">
                            <span class="metric-label">
                                BLOCKS
                            </span>

                            <strong>
                                ${snapshot.blocks.length}
                            </strong>
                        </div>

                        <div class="metric">
                            <span class="metric-label">
                                MEMPOOL
                            </span>

                            <strong>
                                ${snapshot.mempool.length}
                            </strong>
                        </div>

                        <div class="metric">
                            <span class="metric-label">
                                UTXOS
                            </span>

                            <strong>
                                ${snapshot.utxos.length}
                            </strong>
                        </div>

                    </div>

                </section>


                <!-- =================================================
                     WALLET / NODE
                     ================================================= -->

                <section class="info-card">

                    <div class="section-heading">
                        <span>◎</span>
                        <span>YOUR NODE</span>
                    </div>

                    <div class="wallet-address-box">

                        <span class="address-label">
                            WALLET ADDRESS
                        </span>

                        ${escapeHtml(wallet.address)}

                    </div>

                    <div class="barcode">
                        ${makeBarcode(wallet.address)}
                    </div>

                    <p>
                        NODE ${formatNodeId(nodeIdentity.nodeId)}
                    </p>

                    <span>
                        Persistent browser identity //
                        v${nodeIdentity.version ?? "1"}
                    </span>

                </section>


                <!-- =================================================
                     VISUAL CONSENSUS ENGINE
                     ================================================= -->

                <section
                    class="consensus-panel dashboard-wide"
                    id="consensus"
                >

                    <div class="section-heading">
                        <span>✦</span>
                        <span>
                            VISUAL CONSENSUS ENGINE
                        </span>
                    </div>

                    <div class="consensus-track">

                        <div class="consensus-step done">
                            <span class="consensus-step-number">
                                01
                            </span>

                            <span class="consensus-step-label">
                                Transaction
                            </span>
                        </div>

                        <div class="consensus-step ${
                            hasMempoolTransactions
                                ? "done"
                                : ""
                        }">

                            <span class="consensus-step-number">
                                02
                            </span>

                            <span class="consensus-step-label">
                                Mempool
                            </span>

                        </div>

                        <div class="consensus-step ${
                            hasMempoolTransactions
                                ? "active"
                                : ""
                        }">

                            <span class="consensus-step-number">
                                03
                            </span>

                            <span class="consensus-step-label">
                                Mining
                            </span>

                        </div>

                        <div class="consensus-step">

                            <span class="consensus-step-number">
                                04
                            </span>

                            <span class="consensus-step-label">
                                Block Found
                            </span>

                        </div>

                        <div class="consensus-step">

                            <span class="consensus-step-number">
                                05
                            </span>

                            <span class="consensus-step-label">
                                Synchronized
                            </span>

                        </div>

                    </div>

                    <div class="consensus-detail">

                        STATE //
                        ${
                            hasMempoolTransactions
                                ? "TRANSACTIONS WAITING FOR MINING"
                                : "IDLE — READY FOR A TRANSACTION"
                        }

                    </div>

                </section>


                <!-- =================================================
                     ACTIVITY + BLOCK
                     ================================================= -->

                <section
                    class="dashboard-layout dashboard-wide"
                >

                    <div
                        class="panel"
                        style="padding:18px;"
                    >

                        <div class="section-heading">
                            <span>→</span>
                            <span>
                                LATEST ACTIVITY
                            </span>
                        </div>

                        <div class="activity-list">
                            ${renderMempoolActivity(snapshot)}
                        </div>

                    </div>


                    <div
                        class="panel"
                        style="padding:18px;"
                    >

                        <div class="section-heading">
                            <span>▣</span>
                            <span>
                                LATEST BLOCK
                            </span>
                        </div>

                        ${renderLatestBlock(latestBlock)}

                    </div>

                </section>


                <!-- =================================================
                     RAW STATE
                     ================================================= -->

                <section
                    class="tech-panel dashboard-wide"
                >

                    <div class="section-heading">
                        <span>⌘</span>
                        <span>
                            RAW NODE STATE
                        </span>
                    </div>

                    <pre>${escapeHtml(
                        JSON.stringify(
                            snapshot,
                            null,
                            2,
                        ),
                    )}</pre>

                </section>

            </main>


            <!-- =================================================
                 MOBILE / GLOBAL NAVIGATION
                 ================================================= -->

            <nav
                class="bottom-nav"
                aria-label="Primary navigation"
            >

                <button
                    class="nav-item active"
                    type="button"
                    data-scroll="top"
                >
                    <span>⌂</span>
                    <small>
                        Dashboard
                    </small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-action="receive"
                >
                    <span>◉</span>
                    <small>
                        Wallet
                    </small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-scroll="network"
                >
                    <span>⌁</span>
                    <small>
                        Network
                    </small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-scroll="consensus"
                >
                    <span>▣</span>
                    <small>
                        Explorer
                    </small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-scroll="consensus"
                >
                    <span>?</span>
                    <small>
                        Learn
                    </small>
                </button>

            </nav>


            <!-- =================================================
                 TOAST
                 ================================================= -->

            <div
                class="toast"
                id="nova-toast"
                role="status"
                aria-live="polite"
            ></div>

        </div>
    `;

    bindInteractions(root, context);
}

/* =========================================================
   TOAST
   ========================================================= */

function showToast(root, message) {
    const toast = root.querySelector("#nova-toast");

    if (!toast) {
        return;
    }

    toast.textContent = message;

    toast.classList.add("visible");

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
        toast.classList.remove("visible");
    }, 2600);
}

/* =========================================================
   INTERACTIONS
   ========================================================= */

function bindInteractions(root, context) {

    // ---------------------------------------------------------
    // Smooth scrolling
    // ---------------------------------------------------------

    root.querySelectorAll("[data-scroll]").forEach((button) => {
        button.addEventListener("click", () => {

            const target =
                button.dataset.scroll;

            if (target === "top") {
                window.scrollTo({
                    top: 0,
                    behavior: "smooth",
                });

                return;
            }

            const element =
                root.querySelector(`#${target}`);

            element?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        });
    });


    // ---------------------------------------------------------
    // Receive
    // ---------------------------------------------------------

    root.querySelectorAll(
        '[data-action="receive"]',
    ).forEach((button) => {

        button.addEventListener(
            "click",
            async () => {

                try {
                    await navigator.clipboard?.writeText(
                        context.wallet.address,
                    );

                    showToast(
                        root,
                        "Wallet address copied to clipboard.",
                    );
                } catch (error) {
                    console.error(
                        "Clipboard error:",
                        error,
                    );

                    showToast(
                        root,
                        "Wallet address: " +
                            context.wallet.address,
                    );
                }
            },
        );
    });


    // ---------------------------------------------------------
    // Send
    // ---------------------------------------------------------

    root.querySelectorAll(
        '[data-action="send"]',
    ).forEach((button) => {

        button.addEventListener(
            "click",
            () => {

                showToast(
                    root,
                    "Send interface is coming next — the UTXO transaction engine is ready.",
                );
            },
        );
    });


    // ---------------------------------------------------------
    // Mine
    // ---------------------------------------------------------

    root.querySelectorAll(
        '[data-action="mine"]',
    ).forEach((button) => {

        button.addEventListener(
            "click",
            async () => {

                if (
                    context.networkState.mempool.size ===
                    0
                ) {
                    showToast(
                        root,
                        "Mining is idle — no transactions are waiting in the mempool.",
                    );

                    return;
                }

                showToast(
                    root,
                    "Mining transaction block…",
                );

                try {

                    await context.networkState
                        .minePendingTransactions({
                            minerAddress:
                                context.wallet.address,

                            difficulty: 3,
                        });

                    render(
                        root,
                        context,
                    );

                    showToast(
                        root,
                        "Block mined and committed to the local chain.",
                    );

                } catch (error) {

                    console.error(
                        "Mining failed:",
                        error,
                    );

                    showToast(
                        root,
                        "Mining failed. Check the browser console.",
                    );
                }
            },
        );
    });
}

/* =========================================================
   PUBLIC API
   ========================================================= */

export function renderDashboard(context) {
    if (!context?.root) {
        throw new Error(
            "renderDashboard requires a root element.",
        );
    }

    if (!context?.wallet) {
        throw new Error(
            "renderDashboard requires a wallet.",
        );
    }

    if (!context?.networkState) {
        throw new Error(
            "renderDashboard requires networkState.",
        );
    }

    render(
        context.root,
        context,
    );
}