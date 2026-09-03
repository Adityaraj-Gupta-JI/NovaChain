import "../styles/globals.css";

/*
|--------------------------------------------------------------------------
| NovaChain Dashboard
|--------------------------------------------------------------------------
|
| UI layer for the real NovaChain runtime.
|
| The dashboard observes:
|
| Wallet
|   ↓
| Transaction
|   ↓
| Mempool
|   ↓
| Proof of Work
|   ↓
| Block
|   ↓
| UTXO / Balance
|
| No synthetic blockchain state is created here.
|--------------------------------------------------------------------------
*/

const NNC_PER_NVC = 100_000;

export function renderDashboard({
    root,
    nodeIdentity,
    wallet,
    networkState,
}) {
    if (!root) {
        throw new Error("Dashboard root element is required.");
    }

    if (!nodeIdentity?.nodeId) {
        throw new Error("Node identity is required.");
    }

    if (!wallet?.address) {
        throw new Error("Wallet is required.");
    }

    if (!networkState) {
        throw new Error("Network state is required.");
    }

    const runtime = {
        root,
        nodeIdentity,
        wallet,
        networkState,
        currentStage: "READY",
        activity: [],
        mining: false,
        miningStartedAt: null,
        miningNonce: 0,
        miningHash: "",
        lastBlockHeight: getBlockHeight(networkState),
        refreshTimer: null,
    };

    runtime.activity.push({
        type: "system",
        title: "Node initialized",
        detail: "Local blockchain state is ready.",
        timestamp: Date.now(),
    });

    render(runtime);
    bindDashboardEvents(runtime);
    startDashboardRefresh(runtime);
}

function render(runtime) {
    const {
        root,
        nodeIdentity,
        wallet,
        networkState,
    } = runtime;

    const snapshot = getSnapshot(networkState);

    const balance = getWalletBalance(
        networkState,
        wallet.address,
    );

    const balanceNvc = balance / NNC_PER_NVC;

    const latestBlock = getLatestBlock(networkState);

    const blockHeight = latestBlock?.index ?? 0;

    const mempoolTransactions =
        getMempoolTransactions(networkState);

    const mempoolSize =
        mempoolTransactions.length;

    const chainLength =
        networkState.blockchain?.chain?.length ?? 0;

    const currentStage =
        runtime.mining
            ? "MINING"
            : runtime.currentStage;

    root.innerHTML = `
        <div class="nova-shell dashboard-shell">

            <header class="nova-header dashboard-header">

                <button
                    class="brand brand-button"
                    type="button"
                    data-scroll-target="top"
                    aria-label="NovaChain home"
                >
                    <span class="brand-symbol">✦</span>
                    <span class="brand-name">NOVA</span>
                </button>

                <div class="network-status ${runtime.mining ? "is-busy" : ""}">
                    <span class="status-dot"></span>
                    <span>
                        ${runtime.mining ? "MINING" : "NODE ONLINE"}
                    </span>
                </div>

            </header>


            <main class="nova-main dashboard-main" id="top">

                <!-- ==================================================
                     LIVE ACTIVITY SPOTLIGHT
                =================================================== -->

                <section
                    class="hero-card activity-spotlight ${runtime.mining ? "spotlight-mining" : ""}"
                    id="activity"
                    data-section="activity"
                >

                    <div class="spotlight-orbit orbit-one"></div>
                    <div class="spotlight-orbit orbit-two"></div>

                    <div class="sparkle sparkle-one">✦</div>
                    <div class="sparkle sparkle-two">✧</div>

                    <div class="spotlight-topline">

                        <div>
                            <p class="eyebrow">
                                NOVACHAIN // LIVE NETWORK
                            </p>

                            <h1 class="spotlight-title">
                                ${escapeHtml(getStageHeadline(currentStage))}
                            </h1>
                        </div>

                        <div class="live-indicator">
                            <span class="live-pulse"></span>
                            LIVE
                        </div>

                    </div>

                    <p class="hero-description spotlight-description">
                        ${escapeHtml(
                            getStageDescription(
                                currentStage,
                                mempoolSize,
                            ),
                        )}
                    </p>


                    <!-- REAL FLOW -->

                    <div class="consensus-flow" aria-label="NovaChain transaction lifecycle">

                        ${renderFlowStage(
                            "CREATE",
                            "01",
                            ["READY", "CREATE", "SIGNING", "BROADCAST", "MEMPOOL", "MINING", "CONFIRMED"].includes(currentStage),
                            currentStage === "CREATE",
                        )}

                        <span class="flow-arrow">→</span>

                        ${renderFlowStage(
                            "SIGN",
                            "02",
                            ["SIGNING", "BROADCAST", "MEMPOOL", "MINING", "CONFIRMED"].includes(currentStage),
                            currentStage === "SIGNING",
                        )}

                        <span class="flow-arrow">→</span>

                        ${renderFlowStage(
                            "MEMPOOL",
                            "03",
                            ["MEMPOOL", "MINING", "CONFIRMED"].includes(currentStage),
                            currentStage === "MEMPOOL",
                        )}

                        <span class="flow-arrow">→</span>

                        ${renderFlowStage(
                            "PROOF OF WORK",
                            "04",
                            ["MINING", "CONFIRMED"].includes(currentStage),
                            currentStage === "MINING",
                        )}

                        <span class="flow-arrow">→</span>

                        ${renderFlowStage(
                            "BLOCK",
                            "05",
                            currentStage === "CONFIRMED",
                            currentStage === "CONFIRMED",
                        )}

                    </div>


                    <!-- CURRENT OPERATION READOUT -->

                    <div class="operation-readout">

                        <div class="operation-icon">
                            ${getStageIcon(currentStage)}
                        </div>

                        <div class="operation-copy">

                            <span class="operation-label">
                                CURRENT OPERATION
                            </span>

                            <strong>
                                ${escapeHtml(currentStage)}
                            </strong>

                            <small>
                                ${escapeHtml(
                                    getOperationDetail(
                                        runtime,
                                        snapshot,
                                    ),
                                )}
                            </small>

                        </div>

                        <div class="operation-value">
                            ${runtime.mining
                                ? `<span class="operation-live">● RUNNING</span>`
                                : `<span>● STABLE</span>`
                            }
                        </div>

                    </div>


                    <!-- MINING READOUT -->

                    ${runtime.mining
                        ? renderMiningReadout(runtime)
                        : ""
                    }

                </section>


                <!-- ==================================================
                     BALANCE + ACTIONS
                =================================================== -->

                <section
                    class="balance-card"
                    id="wallet"
                    data-section="wallet"
                >

                    <div class="section-heading">
                        <span>◎</span>
                        <span>YOUR NOVACOIN WALLET</span>
                    </div>

                    <div class="balance-layout">

                        <div class="balance-copy">

                            <span class="metric-label">
                                AVAILABLE BALANCE
                            </span>

                            <div class="balance-number">
                                ${formatNvc(balanceNvc)}
                            </div>

                            <div class="balance-unit">
                                NVC
                            </div>

                            <div class="balance-subvalue">
                                ${formatInteger(balance)}
                                NNC
                            </div>

                        </div>

                        <div class="coin-display">
                            <div class="coin-face">
                                N
                            </div>
                            <span>NVC</span>
                        </div>

                    </div>


                    <div class="action-grid">

                        <button
                            class="action-tile action-send"
                            type="button"
                            data-action="send"
                        >
                            <span class="action-icon">↗</span>
                            <span class="action-name">SEND</span>
                            <small>CREATE TX</small>
                        </button>


                        <button
                            class="action-tile action-mine"
                            type="button"
                            data-action="mine"
                            ${runtime.mining ? "disabled" : ""}
                        >
                            <span class="action-icon">
                                ${runtime.mining ? "◌" : "⛏"}
                            </span>

                            <span class="action-name">
                                ${runtime.mining ? "MINING" : "MINE"}
                            </span>

                            <small>
                                ${runtime.mining
                                    ? "WORKING"
                                    : "PROOF OF WORK"
                                }
                            </small>
                        </button>


                        <button
                            class="action-tile action-receive"
                            type="button"
                            data-action="receive"
                        >
                            <span class="action-icon">↓</span>
                            <span class="action-name">RECEIVE</span>
                            <small>WALLET ADDRESS</small>
                        </button>

                    </div>

                </section>


                <!-- ==================================================
                     NETWORK TELEMETRY
                =================================================== -->

                <section
                    class="network-card telemetry-card"
                    id="network"
                    data-section="network"
                >

                    <div class="section-heading">
                        <span>☁</span>
                        <span>LOCAL NODE TELEMETRY</span>
                    </div>

                    <div class="network-grid">

                        ${renderMetric(
                            "BLOCK HEIGHT",
                            blockHeight,
                            "#",
                        )}

                        ${renderMetric(
                            "MEMPOOL",
                            mempoolSize,
                            "TX",
                        )}

                        ${renderMetric(
                            "CHAIN",
                            chainLength,
                            "BLOCKS",
                        )}

                        ${renderMetric(
                            "UTXO",
                            getUtxoCount(networkState),
                            "OUTPUTS",
                        )}

                    </div>

                </section>


                <!-- ==================================================
                     VISUAL CONSENSUS ENGINE
                =================================================== -->

                <section
                    class="consensus-card"
                    id="consensus"
                >

                    <div class="section-heading">
                        <span>✹</span>
                        <span>VISUAL CONSENSUS ENGINE</span>
                    </div>

                    <div class="consensus-header">

                        <div>
                            <h2>
                                Watch the ledger move.
                            </h2>

                            <p>
                                Every visible state below comes from
                                the local NovaChain runtime.
                            </p>
                        </div>

                        <div class="consensus-status">
                            <span class="status-dot"></span>
                            ${escapeHtml(currentStage)}
                        </div>

                    </div>


                    <div class="consensus-rail">

                        ${renderConsensusNode(
                            "01",
                            "WALLET",
                            "Transaction origin",
                            currentStage,
                            ["CREATE", "SIGNING", "BROADCAST", "MEMPOOL", "MINING", "CONFIRMED"],
                        )}

                        <div class="consensus-connector"></div>

                        ${renderConsensusNode(
                            "02",
                            "MEMPOOL",
                            `${mempoolSize} pending transaction${mempoolSize === 1 ? "" : "s"}`,
                            currentStage,
                            ["MEMPOOL", "MINING", "CONFIRMED"],
                        )}

                        <div class="consensus-connector"></div>

                        ${renderConsensusNode(
                            "03",
                            "MINER",
                            runtime.mining
                                ? "Searching nonce"
                                : "Awaiting work",
                            currentStage,
                            ["MINING", "CONFIRMED"],
                        )}

                        <div class="consensus-connector"></div>

                        ${renderConsensusNode(
                            "04",
                            "CHAIN",
                            `Block #${blockHeight}`,
                            currentStage,
                            ["CONFIRMED"],
                        )}

                    </div>

                </section>


                <!-- ==================================================
                     ACTIVITY
                =================================================== -->

                <section
                    class="activity-card"
                    id="activity-feed"
                >

                    <div class="section-heading">
                        <span>≋</span>
                        <span>LIVE ACTIVITY</span>
                    </div>

                    <div class="activity-list">

                        ${renderActivity(
                            runtime.activity,
                            mempoolTransactions,
                        )}

                    </div>

                </section>


                <!-- ==================================================
                     LATEST BLOCK
                =================================================== -->

                <section class="block-card">

                    <div class="section-heading">
                        <span>▣</span>
                        <span>LATEST BLOCK</span>
                    </div>

                    ${renderLatestBlock(latestBlock)}

                </section>


                <!-- ==================================================
                     NODE IDENTITY
                =================================================== -->

                <section
                    class="node-card"
                    id="node"
                    data-section="node"
                >

                    <div class="section-heading">
                        <span>◉</span>
                        <span>YOUR NODE</span>
                    </div>

                    <div class="node-identity-panel">

                        <div class="node-avatar">
                            ✦
                        </div>

                        <div class="node-identity-copy">

                            <span class="metric-label">
                                PUBLIC NODE ID
                            </span>

                            <strong>
                                ${escapeHtml(
                                    shortId(nodeIdentity.nodeId),
                                )}
                            </strong>

                            <small>
                                ${escapeHtml(nodeIdentity.nodeId)}
                            </small>

                        </div>

                    </div>


                    <div class="address-panel">

                        <span class="metric-label">
                            WALLET ADDRESS
                        </span>

                        <div class="address-row">

                            <code>
                                ${escapeHtml(wallet.address)}
                            </code>

                            <button
                                type="button"
                                class="copy-button"
                                data-action="copy-address"
                            >
                                COPY
                            </button>

                        </div>

                    </div>

                </section>


                <!-- ==================================================
                     RAW STATE
                =================================================== -->

                <details class="technical-card">

                    <summary>
                        <span>⌘</span>
                        <strong>RAW NODE STATE</strong>
                        <span>+</span>
                    </summary>

                    <pre>${escapeHtml(
                        JSON.stringify(
                            snapshot,
                            null,
                            2,
                        ),
                    )}</pre>

                </details>

            </main>


            <!-- ======================================================
                 BOTTOM NAV
            ======================================================= -->

            <nav class="bottom-nav dashboard-nav">

                <button
                    class="nav-item active"
                    type="button"
                    data-scroll-target="top"
                >
                    <span>✦</span>
                    <small>HOME</small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-scroll-target="network"
                >
                    <span>◉</span>
                    <small>NETWORK</small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-scroll-target="wallet"
                >
                    <span>◎</span>
                    <small>WALLET</small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-scroll-target="activity-feed"
                >
                    <span>≋</span>
                    <small>ACTIVITY</small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-scroll-target="node"
                >
                    <span>☁</span>
                    <small>NODE</small>
                </button>

            </nav>


            <div
                class="nova-toast"
                id="nova-toast"
                role="status"
                aria-live="polite"
            ></div>

        </div>


        <!-- ==========================================================
             SEND MODAL
        =========================================================== -->

        <div
            class="nova-modal-backdrop"
            id="send-modal"
            hidden
        >

            <section
                class="nova-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="send-title"
            >

                <button
                    class="modal-close"
                    type="button"
                    data-action="close-send"
                    aria-label="Close send dialog"
                >
                    ×
                </button>

                <p class="eyebrow">
                    NOVACHAIN // TRANSACTION
                </p>

                <h2 id="send-title">
                    SEND NVC
                </h2>

                <p class="modal-description">
                    Create a real signed transaction from your local
                    UTXO set and place it into the mempool.
                </p>


                <form id="send-form">

                    <label class="form-field">

                        <span>
                            RECIPIENT ADDRESS
                        </span>

                        <input
                            id="recipient-address"
                            name="recipientAddress"
                            type="text"
                            placeholder="NVC..."
                            autocomplete="off"
                            required
                        />

                    </label>


                    <label class="form-field">

                        <span>
                            AMOUNT
                        </span>

                        <div class="amount-input">

                            <input
                                id="send-amount"
                                name="amount"
                                type="number"
                                min="1"
                                step="0.000001"
                                placeholder="0.000000"
                                required
                            />

                            <strong>NVC</strong>

                        </div>

                    </label>


                    <div class="send-preview">

                        <div>
                            <span>AVAILABLE</span>
                            <strong id="send-available">
                                ${formatNvc(balanceNvc)} NVC
                            </strong>
                        </div>

                        <div>
                            <span>FLOW</span>
                            <strong>
                                SIGN → MEMPOOL
                            </strong>
                        </div>

                    </div>


                    <button
                        class="primary-button modal-submit"
                        type="submit"
                        id="send-submit"
                    >
                        SIGN & BROADCAST
                    </button>

                </form>

            </section>

        </div>


        <!-- ==========================================================
             RECEIVE MODAL
        =========================================================== -->

        <div
            class="nova-modal-backdrop"
            id="receive-modal"
            hidden
        >

            <section
                class="nova-modal"
                role="dialog"
                aria-modal="true"
            >

                <button
                    class="modal-close"
                    type="button"
                    data-action="close-receive"
                    aria-label="Close receive dialog"
                >
                    ×
                </button>

                <p class="eyebrow">
                    NOVACHAIN // RECEIVE
                </p>

                <h2>
                    YOUR ADDRESS
                </h2>

                <p class="modal-description">
                    Share this wallet address with another NovaChain node.
                </p>

                <div class="receive-address">
                    <code>
                        ${escapeHtml(wallet.address)}
                    </code>
                </div>

                <button
                    class="primary-button"
                    type="button"
                    data-action="copy-address"
                >
                    COPY ADDRESS
                </button>

            </section>

        </div>
    `;
}


/*
|--------------------------------------------------------------------------
| Event Binding
|--------------------------------------------------------------------------
*/

function bindDashboardEvents(runtime) {
    const { root } = runtime;

    root.addEventListener("click", async (event) => {
        const actionElement =
            event.target.closest("[data-action]");

        const scrollElement =
            event.target.closest("[data-scroll-target]");

        if (scrollElement) {
            const target =
                scrollElement.dataset.scrollTarget;

            scrollToSection(target);

            updateActiveNav(
                root,
                target,
            );

            return;
        }

        if (!actionElement) {
            return;
        }

        const action =
            actionElement.dataset.action;

        if (action === "send") {
            openModal("send-modal");
            return;
        }

        if (action === "receive") {
            openModal("receive-modal");
            return;
        }

        if (action === "close-send") {
            closeModal("send-modal");
            return;
        }

        if (action === "close-receive") {
            closeModal("receive-modal");
            return;
        }

        if (action === "copy-address") {
            await copyWalletAddress(runtime);
            return;
        }

        if (action === "mine") {
            await handleMine(runtime);
        }
    });


    root.addEventListener("submit", async (event) => {
        if (event.target.id !== "send-form") {
            return;
        }

        event.preventDefault();

        await handleSend(
            runtime,
            event.target,
        );
    });


    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key !== "Escape") {
                return;
            }

            closeModal("send-modal");
            closeModal("receive-modal");
        },
        {
            once: true,
        },
    );
}


/*
|--------------------------------------------------------------------------
| Send
|--------------------------------------------------------------------------
*/

async function handleSend(runtime, form) {
    const submitButton =
        form.querySelector("#send-submit");

    const recipientInput =
        form.querySelector("#recipient-address");

    const amountInput =
        form.querySelector("#send-amount");

    const recipientAddress =
        recipientInput.value.trim();

    const amountNvc =
        Number(amountInput.value);

    if (!recipientAddress) {
        showToast(
            runtime,
            "Recipient address is required.",
            "error",
        );

        return;
    }

    if (!Number.isFinite(amountNvc) || amountNvc <= 0) {
        showToast(
            runtime,
            "Enter a valid amount.",
            "error",
        );

        return;
    }

    const amountNnc =
        Math.round(
            amountNvc * NNC_PER_NVC,
        );

    if (!Number.isSafeInteger(amountNnc) || amountNnc <= 0) {
        showToast(
            runtime,
            "Amount is outside the supported range.",
            "error",
        );

        return;
    }


    try {
        submitButton.disabled = true;
        submitButton.textContent = "SIGNING...";

        setStage(
            runtime,
            "CREATE",
        );

        addActivity(
            runtime,
            {
                type: "transaction",
                title: "Transaction created",
                detail: `${formatNvc(amountNvc)} NVC → ${shortId(recipientAddress)}`,
                timestamp: Date.now(),
            },
        );

        render(runtime);


        await nextFrame();

        setStage(
            runtime,
            "SIGNING",
        );

        render(runtime);

        await nextFrame();


        const transaction =
            await runtime.networkState.createPayment({
                wallet: runtime.wallet,
                recipientAddress,
                amount: amountNnc,
            });


        setStage(
            runtime,
            "MEMPOOL",
        );

        addActivity(
            runtime,
            {
                type: "transaction",
                title: "Transaction entered mempool",
                detail: `TX ${shortId(transaction.id)}`,
                timestamp: Date.now(),
            },
        );

        showToast(
            runtime,
            "Transaction signed and added to mempool.",
            "success",
        );

        closeModal("send-modal");

        form.reset();

        render(runtime);

    } catch (error) {
        console.error(
            "NovaChain send failed:",
            error,
        );

        setStage(
            runtime,
            "READY",
        );

        showToast(
            runtime,
            getErrorMessage(error),
            "error",
        );

        render(runtime);

    } finally {
        const currentButton =
            document.querySelector("#send-submit");

        if (currentButton) {
            currentButton.disabled = false;
            currentButton.textContent =
                "SIGN & BROADCAST";
        }
    }
}


/*
|--------------------------------------------------------------------------
| Mining
|--------------------------------------------------------------------------
*/

async function handleMine(runtime) {
    if (runtime.mining) {
        return;
    }

    const mempool =
        getMempoolTransactions(
            runtime.networkState,
        );

    if (mempool.length === 0) {
        setStage(
            runtime,
            "READY",
        );

        showToast(
            runtime,
            "Mempool is empty. Create a transaction first.",
            "info",
        );

        addActivity(
            runtime,
            {
                type: "system",
                title: "Mining waiting",
                detail: "No pending transactions are available.",
                timestamp: Date.now(),
            },
        );

        render(runtime);

        return;
    }


    runtime.mining = true;
    runtime.miningStartedAt = Date.now();
    runtime.miningNonce = 0;
    runtime.miningHash = "";

    setStage(
        runtime,
        "MINING",
    );

    addActivity(
        runtime,
        {
            type: "mining",
            title: "Proof of Work started",
            detail: `${mempool.length} transaction${mempool.length === 1 ? "" : "s"} selected.`,
            timestamp: Date.now(),
        },
    );

    render(runtime);


    try {
        const minedBlock =
            await runtime.networkState.minePendingTransactions({
                minerAddress:
                    runtime.wallet.address,

                difficulty:
                    3,

                onProgress(progress) {
                    runtime.miningNonce =
                        progress.nonce ?? 0;

                    runtime.miningHash =
                        progress.hash ?? "";

                    setStage(
                        runtime,
                        "MINING",
                        false,
                    );

                    renderMiningOnly(runtime);
                },
            });


        runtime.mining = false;

        setStage(
            runtime,
            "CONFIRMED",
        );

        runtime.lastBlockHeight =
            minedBlock.index;


        addActivity(
            runtime,
            {
                type: "block",
                title: `Block #${minedBlock.index} confirmed`,
                detail: `PoW satisfied with nonce ${minedBlock.nonce}.`,
                timestamp: Date.now(),
            },
        );


        addActivity(
            runtime,
            {
                type: "reward",
                title: "Mining reward received",
                detail: "+50,000 NNC",
                timestamp: Date.now(),
            },
        );


        showToast(
            runtime,
            `Block #${minedBlock.index} mined successfully.`,
            "success",
        );

        render(runtime);

        /*
         * Let the CONFIRMED spotlight remain visible briefly
         * before returning to the stable state.
         */
        window.setTimeout(() => {
            if (!runtime.mining) {
                setStage(
                    runtime,
                    "READY",
                );

                render(runtime);
            }
        }, 1800);

    } catch (error) {
        runtime.mining = false;

        setStage(
            runtime,
            "READY",
        );

        console.error(
            "NovaChain mining failed:",
            error,
        );

        addActivity(
            runtime,
            {
                type: "error",
                title: "Mining failed",
                detail: getErrorMessage(error),
                timestamp: Date.now(),
            },
        );

        showToast(
            runtime,
            getErrorMessage(error),
            "error",
        );

        render(runtime);
    }
}


/*
|--------------------------------------------------------------------------
| Runtime Refresh
|--------------------------------------------------------------------------
*/

function startDashboardRefresh(runtime) {
    runtime.refreshTimer =
        window.setInterval(() => {
            if (!runtime.root.isConnected) {
                window.clearInterval(
                    runtime.refreshTimer,
                );

                return;
            }

            const latestHeight =
                getBlockHeight(
                    runtime.networkState,
                );

            if (
                latestHeight !==
                runtime.lastBlockHeight
            ) {
                runtime.lastBlockHeight =
                    latestHeight;

                if (!runtime.mining) {
                    setStage(
                        runtime,
                        "CONFIRMED",
                    );
                }
            }

            renderLiveCounters(runtime);
        }, 750);
}


/*
|--------------------------------------------------------------------------
| Render Helpers
|--------------------------------------------------------------------------
*/

function renderFlowStage(
    label,
    number,
    complete,
    active,
) {
    return `
        <div class="flow-stage ${complete ? "is-complete" : ""} ${active ? "is-active" : ""}">
            <span class="flow-number">
                ${number}
            </span>

            <span class="flow-label">
                ${escapeHtml(label)}
            </span>
        </div>
    `;
}


function renderMiningReadout(runtime) {
    const elapsed =
        runtime.miningStartedAt
            ? Math.max(
                0,
                Date.now() -
                runtime.miningStartedAt,
            )
            : 0;

    const seconds =
        (elapsed / 1000).toFixed(1);

    return `
        <div class="mining-readout">

            <div class="mining-topline">

                <span>
                    ⛏ PROOF OF WORK SEARCH
                </span>

                <strong>
                    DIFFICULTY 3
                </strong>

            </div>


            <div class="mining-main">

                <div class="nonce-display">
                    <span>NONCE</span>
                    <strong>
                        ${formatInteger(runtime.miningNonce)}
                    </strong>
                </div>

                <div class="hash-display">

                    <span>LATEST HASH</span>

                    <code>
                        ${escapeHtml(
                            runtime.miningHash
                                ? runtime.miningHash
                                : "SEARCHING...",
                        )}
                    </code>

                </div>

                <div class="mining-time">
                    <span>ELAPSED</span>
                    <strong>
                        ${seconds}s
                    </strong>
                </div>

            </div>


            <div class="mining-target">

                <span>
                    TARGET
                </span>

                <code>
                    000xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
                </code>

            </div>

        </div>
    `;
}


function renderConsensusNode(
    number,
    title,
    detail,
    currentStage,
    activeStages,
) {
    const active =
        activeStages.includes(
            currentStage,
        );

    const complete =
        currentStage === "CONFIRMED" &&
        activeStages.includes(
            "CONFIRMED",
        );

    return `
        <div
            class="consensus-node ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}"
        >

            <span class="consensus-number">
                ${number}
            </span>

            <div class="consensus-node-body">

                <strong>
                    ${escapeHtml(title)}
                </strong>

                <small>
                    ${escapeHtml(detail)}
                </small>

            </div>

        </div>
    `;
}


function renderMetric(
    label,
    value,
    unit,
) {
    return `
        <div class="metric">

            <span class="metric-label">
                ${escapeHtml(label)}
            </span>

            <strong>
                ${escapeHtml(String(value))}
            </strong>

            <small>
                ${escapeHtml(unit)}
            </small>

        </div>
    `;
}


function renderActivity(
    activities,
    mempoolTransactions,
) {
    const entries = [
        ...activities,
    ];

    for (
        const transaction
        of mempoolTransactions
    ) {
        if (
            !entries.some(
                (entry) =>
                    entry.txId ===
                    transaction.id,
            )
        ) {
            entries.push({
                type: "pending",
                title: "Transaction pending",
                detail: `TX ${shortId(transaction.id)}`,
                timestamp: Date.now(),
                txId: transaction.id,
            });
        }
    }

    entries.sort(
        (a, b) =>
            b.timestamp -
            a.timestamp,
    );

    const visible =
        entries.slice(
            0,
            7,
        );

    if (visible.length === 0) {
        return `
            <div class="empty-state">
                <span>☁</span>
                <strong>No activity yet.</strong>
                <small>
                    The local node is waiting for an operation.
                </small>
            </div>
        `;
    }

    return visible
        .map(
            (entry) => `
                <article class="activity-item activity-${escapeHtml(entry.type)}">

                    <div class="activity-icon">
                        ${getActivityIcon(entry.type)}
                    </div>

                    <div class="activity-copy">

                        <strong>
                            ${escapeHtml(entry.title)}
                        </strong>

                        <small>
                            ${escapeHtml(entry.detail)}
                        </small>

                    </div>

                    <time>
                        ${formatRelativeTime(entry.timestamp)}
                    </time>

                </article>
            `,
        )
        .join("");
}


function renderLatestBlock(block) {
    if (!block) {
        return `
            <div class="empty-state">
                <span>▣</span>
                <strong>No block available.</strong>
            </div>
        `;
    }

    return `
        <div class="latest-block">

            <div class="block-main">

                <span class="metric-label">
                    BLOCK HEIGHT
                </span>

                <strong>
                    #${escapeHtml(
                        String(block.index),
                    )}
                </strong>

            </div>


            <div class="block-details">

                <div>
                    <span>HASH</span>

                    <code>
                        ${escapeHtml(
                            shortId(block.hash),
                        )}
                    </code>
                </div>


                <div>
                    <span>MERKLE ROOT</span>

                    <code>
                        ${escapeHtml(
                            shortId(block.merkleRoot),
                        )}
                    </code>
                </div>


                <div>
                    <span>DIFFICULTY</span>

                    <strong>
                        ${escapeHtml(
                            String(
                                block.difficulty ?? 0,
                            ),
                        )}
                    </strong>
                </div>


                <div>
                    <span>TRANSACTIONS</span>

                    <strong>
                        ${block.transactions?.length ?? 0}
                    </strong>
                </div>

            </div>

        </div>
    `;
}


/*
|--------------------------------------------------------------------------
| Live-only Rendering
|--------------------------------------------------------------------------
*/

function renderMiningOnly(runtime) {
    const root =
        runtime.root;

    const spotlight =
        root.querySelector(
            ".activity-spotlight",
        );

    if (!spotlight) {
        render(runtime);
        return;
    }

    spotlight.classList.add(
        "spotlight-mining",
    );

    const operation =
        spotlight.querySelector(
            ".operation-readout",
        );

    if (operation) {
        const detail =
            operation.querySelector(
                ".operation-copy small",
            );

        const nonce =
            operation.querySelector(
                ".operation-value",
            );

        if (detail) {
            detail.textContent =
                `Searching nonce ${formatInteger(runtime.miningNonce)}...`;
        }

        if (nonce) {
            nonce.innerHTML =
                `<span class="operation-live">● MINING</span>`;
        }
    }

    const existingMiningReadout =
        spotlight.querySelector(
            ".mining-readout",
        );

    if (existingMiningReadout) {
        existingMiningReadout.outerHTML =
            renderMiningReadout(runtime);
    }
}


function renderLiveCounters(runtime) {
    const root =
        runtime.root;

    const balance =
        getWalletBalance(
            runtime.networkState,
            runtime.wallet.address,
        );

    const balanceElement =
        root.querySelector(
            ".balance-number",
        );

    if (balanceElement) {
        balanceElement.textContent =
            formatNvc(
                balance /
                NNC_PER_NVC,
            );
    }


    const metrics =
        root.querySelectorAll(
            ".telemetry-card .metric",
        );

    const latestBlock =
        getLatestBlock(
            runtime.networkState,
        );

    const values = [
        latestBlock?.index ?? 0,
        getMempoolTransactions(
            runtime.networkState,
        ).length,
        runtime.networkState.blockchain?.chain?.length ?? 0,
        getUtxoCount(
            runtime.networkState,
        ),
    ];

    metrics.forEach(
        (metric, index) => {
            const strong =
                metric.querySelector(
                    "strong",
                );

            if (strong) {
                strong.textContent =
                    String(
                        values[index],
                    );
            }
        },
    );
}


/*
|--------------------------------------------------------------------------
| State
|--------------------------------------------------------------------------
*/

function setStage(
    runtime,
    stage,
    record = true,
) {
    runtime.currentStage =
        stage;

    if (!record) {
        return;
    }

    const labels = {
        CREATE:
            "Transaction creation started.",
        SIGNING:
            "Transaction signature generated.",
        MEMPOOL:
            "Transaction accepted into mempool.",
        MINING:
            "Proof of Work search started.",
        CONFIRMED:
            "Block accepted and chain updated.",
        READY:
            "Node is ready.",
    };

    runtime.activity.unshift({
        type:
            stage === "MINING"
                ? "mining"
                : "system",
        title:
            `State: ${stage}`,
        detail:
            labels[stage] ??
            "NovaChain state changed.",
        timestamp:
            Date.now(),
    });

    runtime.activity =
        runtime.activity.slice(
            0,
            20,
        );
}


/*
|--------------------------------------------------------------------------
| Modals
|--------------------------------------------------------------------------
*/

function openModal(id) {
    const modal =
        document.getElementById(id);

    if (!modal) {
        return;
    }

    modal.hidden = false;

    window.requestAnimationFrame(
        () => {
            modal.classList.add(
                "is-open",
            );

            const firstInput =
                modal.querySelector(
                    "input",
                );

            firstInput?.focus();
        },
    );
}


function closeModal(id) {
    const modal =
        document.getElementById(id);

    if (!modal) {
        return;
    }

    modal.classList.remove(
        "is-open",
    );

    window.setTimeout(
        () => {
            modal.hidden = true;
        },
        160,
    );
}


/*
|--------------------------------------------------------------------------
| Clipboard
|--------------------------------------------------------------------------
*/

async function copyWalletAddress(runtime) {
    try {
        await navigator.clipboard.writeText(
            runtime.wallet.address,
        );

        showToast(
            runtime,
            "Wallet address copied.",
            "success",
        );

    } catch (error) {
        console.error(
            "Clipboard error:",
            error,
        );

        showToast(
            runtime,
            "Could not copy the address.",
            "error",
        );
    }
}


/*
|--------------------------------------------------------------------------
| Toast
|--------------------------------------------------------------------------
*/

function showToast(
    runtime,
    message,
    type = "info",
) {
    const toast =
        runtime.root.querySelector(
            "#nova-toast",
        );

    if (!toast) {
        return;
    }

    toast.textContent =
        message;

    toast.dataset.type =
        type;

    toast.classList.add(
        "is-visible",
    );

    window.clearTimeout(
        toast._novaTimeout,
    );

    toast._novaTimeout =
        window.setTimeout(
            () => {
                toast.classList.remove(
                    "is-visible",
                );
            },
            2800,
        );
}


/*
|--------------------------------------------------------------------------
| Activity
|--------------------------------------------------------------------------
*/

function addActivity(
    runtime,
    activity,
) {
    runtime.activity.unshift(
        activity,
    );

    runtime.activity =
        runtime.activity.slice(
            0,
            20,
        );
}


/*
|--------------------------------------------------------------------------
| Navigation
|--------------------------------------------------------------------------
*/

function scrollToSection(target) {
    const element =
        document.getElementById(
            target,
        );

    if (!element) {
        return;
    }

    element.scrollIntoView({
        behavior: "smooth",
        block: "start",
    });
}


function updateActiveNav(
    root,
    target,
) {
    root
        .querySelectorAll(
            ".nav-item",
        )
        .forEach(
            (item) => {
                item.classList.toggle(
                    "active",
                    item.dataset.scrollTarget ===
                        target,
                );
            },
        );
}


/*
|--------------------------------------------------------------------------
| Runtime Access
|--------------------------------------------------------------------------
*/

function getSnapshot(
    networkState,
) {
    try {
        if (
            typeof networkState.getStateSnapshot ===
            "function"
        ) {
            return networkState.getStateSnapshot();
        }
    } catch (error) {
        console.warn(
            "Could not read state snapshot:",
            error,
        );
    }

    return {
        initialized:
            networkState.initialized,
        isMining:
            networkState.isMining,
        blockHeight:
            getBlockHeight(networkState),
        mempoolSize:
            getMempoolTransactions(
                networkState,
            ).length,
        utxoCount:
            getUtxoCount(networkState),
    };
}


function getLatestBlock(
    networkState,
) {
    if (
        typeof networkState.getLatestBlock ===
        "function"
    ) {
        return networkState.getLatestBlock();
    }

    return networkState.blockchain?.chain?.[
        networkState.blockchain.chain.length - 1
    ];
}


function getBlockHeight(
    networkState,
) {
    return (
        getLatestBlock(
            networkState,
        )?.index ?? 0
    );
}


function getMempoolTransactions(
    networkState,
) {
    if (
        typeof networkState.getMempoolTransactions ===
        "function"
    ) {
        return networkState.getMempoolTransactions();
    }

    if (
        networkState.mempool &&
        typeof networkState.mempool.getTransactions ===
            "function"
    ) {
        return networkState.mempool.getTransactions();
    }

    return [];
}


function getWalletBalance(
    networkState,
    address,
) {
    if (
        typeof networkState.getBalance ===
        "function"
    ) {
        return networkState.getBalance(
            address,
        );
    }

    return 0;
}


function getUtxoCount(
    networkState,
) {
    if (
        typeof networkState.getUTXOs ===
        "function"
    ) {
        return networkState.getUTXOs().length;
    }

    if (
        Array.isArray(
            networkState.utxos,
        )
    ) {
        return networkState.utxos.length;
    }

    return 0;
}


/*
|--------------------------------------------------------------------------
| Formatting
|--------------------------------------------------------------------------
*/

function formatNvc(value) {
    return Number(
        value ?? 0,
    ).toLocaleString(
        "en-IN",
        {
            minimumFractionDigits: 6,
            maximumFractionDigits: 6,
        },
    );
}


function formatInteger(value) {
    return Number(
        value ?? 0,
    ).toLocaleString(
        "en-IN",
    );
}


function shortId(
    value,
) {
    if (!value) {
        return "—";
    }

    const stringValue =
        String(value);

    if (stringValue.length <= 18) {
        return stringValue;
    }

    return `${stringValue.slice(0, 9)}…${stringValue.slice(-7)}`;
}


function formatRelativeTime(
    timestamp,
) {
    const difference =
        Math.max(
            0,
            Date.now() -
            timestamp,
        );

    if (difference < 1000) {
        return "now";
    }

    if (difference < 60_000) {
        return `${Math.floor(
            difference / 1000,
        )}s`;
    }

    if (difference < 3_600_000) {
        return `${Math.floor(
            difference / 60_000,
        )}m`;
    }

    return `${Math.floor(
        difference / 3_600_000,
    )}h`;
}


/*
|--------------------------------------------------------------------------
| Copy / Safety
|--------------------------------------------------------------------------
*/

function escapeHtml(
    value,
) {
    return String(value)
        .replaceAll(
            "&",
            "&amp;",
        )
        .replaceAll(
            "<",
            "&lt;",
        )
        .replaceAll(
            ">",
            "&gt;",
        )
        .replaceAll(
            '"',
            "&quot;",
        )
        .replaceAll(
            "'",
            "&#039;",
        );
}


function getErrorMessage(
    error,
) {
    if (
        error instanceof Error
    ) {
        return error.message;
    }

    return String(error);
}


/*
|--------------------------------------------------------------------------
| Stage Copy
|--------------------------------------------------------------------------
*/

function getStageHeadline(
    stage,
) {
    const headlines = {
        READY:
            "YOUR NODE IS ALIVE.",
        CREATE:
            "BUILDING THE TRANSACTION.",
        SIGNING:
            "SIGNING THE PAYMENT.",
        MEMPOOL:
            "WAITING IN THE MEMPOOL.",
        MINING:
            "SEARCHING FOR THE BLOCK.",
        CONFIRMED:
            "BLOCK FOUND. CHAIN UPDATED.",
    };

    return (
        headlines[stage] ??
        "WATCH THE NETWORK MOVE."
    );
}


function getStageDescription(
    stage,
    mempoolSize,
) {
    const descriptions = {
        READY:
            "Your browser node is connected to its local ledger. Nothing is being simulated behind the scenes.",
        CREATE:
            "The wallet is constructing a payment from available UTXOs.",
        SIGNING:
            "The wallet is producing the cryptographic signature required by the transaction.",
        MEMPOOL:
            "The signed transaction has entered the local pending-transaction pool.",
        MINING:
            "The miner is repeatedly hashing block headers until the Proof of Work target is satisfied.",
        CONFIRMED:
            "A valid block was mined and accepted. The ledger state has moved forward.",
    };

    if (stage === "MEMPOOL") {
        return `${mempoolSize} transaction${mempoolSize === 1 ? "" : "s"} currently waiting for inclusion.`;
    }

    return (
        descriptions[stage] ??
        "NovaChain is processing the local blockchain state."
    );
}


function getOperationDetail(
    runtime,
    snapshot,
) {
    if (runtime.mining) {
        return `Nonce ${formatInteger(runtime.miningNonce)} · ${runtime.miningHash ? shortId(runtime.miningHash) : "searching hash"}`;
    }

    if (runtime.currentStage === "MEMPOOL") {
        return `${snapshot.mempoolSize ?? getMempoolTransactions(runtime.networkState).length} pending transaction(s)`;
    }

    if (runtime.currentStage === "CONFIRMED") {
        return `Block #${getBlockHeight(runtime.networkState)} is now the latest block`;
    }

    return `Block #${getBlockHeight(runtime.networkState)} · local node ready`;
}


function getStageIcon(
    stage,
) {
    const icons = {
        READY: "✦",
        CREATE: "＋",
        SIGNING: "⌁",
        MEMPOOL: "≋",
        MINING: "⛏",
        CONFIRMED: "✓",
    };

    return (
        icons[stage] ??
        "✦"
    );
}


function getActivityIcon(
    type,
) {
    const icons = {
        system: "✦",
        transaction: "↗",
        mining: "⛏",
        block: "▣",
        reward: "★",
        pending: "☁",
        error: "!",
    };

    return (
        icons[type] ??
        "•"
    );
}


/*
|--------------------------------------------------------------------------
| Small Helpers
|--------------------------------------------------------------------------
*/

function nextFrame() {
    return new Promise(
        (resolve) => {
            window.requestAnimationFrame(
                () => resolve(),
            );
        },
    );
}