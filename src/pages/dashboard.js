import "../styles/globals.css";

/*
|--------------------------------------------------------------------------
| NovaChain Dashboard
|--------------------------------------------------------------------------
|
| Product UI for the browser-native local blockchain runtime.
|
| Real runtime flow:
|
| Wallet
|   ↓
| Transaction creation
|   ↓
| Signature
|   ↓
| Mempool
|   ↓
| Proof of Work
|   ↓
| Block validation
|   ↓
| UTXO update
|
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
        throw new Error(
            "Dashboard root element is required."
        );
    }

    if (!nodeIdentity?.nodeId) {
        throw new Error(
            "Node identity is required."
        );
    }

    if (!wallet?.address) {
        throw new Error(
            "Wallet is required."
        );
    }

    if (!networkState) {
        throw new Error(
            "Network state is required."
        );
    }

    const runtime = {
        root,
        nodeIdentity,
        wallet,
        networkState,

        stage: "READY",

        activity: [
            {
                type: "system",
                title: "Node initialized",
                detail:
                    "Local blockchain state is ready.",
                timestamp: Date.now(),
            },
        ],

        mining: false,
        miningStartedAt: null,
        miningNonce: 0,
        miningHash: "",
        lastBlockHeight:
            getBlockHeight(networkState),
        refreshTimer: null,
    };

    render(runtime);
    bindEvents(runtime);
    startRefresh(runtime);
}


/*
|--------------------------------------------------------------------------
| Main Render
|--------------------------------------------------------------------------
*/

function render(runtime) {
    const {
        root,
        nodeIdentity,
        wallet,
        networkState,
    } = runtime;

    const snapshot =
        getSnapshot(networkState);

    const balance =
        networkState.getBalance(
            wallet.address
        );

    const latestBlock =
        networkState.getLatestBlock();

    const blockHeight =
        latestBlock?.index ?? 0;

    const mempool =
        networkState.getMempoolTransactions();

    const chainLength =
        networkState.getChain().length;

    const currentStage =
        runtime.mining
            ? "MINING"
            : runtime.stage;

    root.innerHTML = `
        <div class="nova-shell">

            <header class="nova-header">

                <button
                    class="brand brand-button"
                    type="button"
                    data-scroll="top"
                >
                    <span class="brand-symbol">✦</span>
                    <span class="brand-name">NOVA</span>
                </button>

                <div
                    class="network-status ${runtime.mining ? "is-busy" : ""}"
                >
                    <span class="status-dot"></span>
                    <span>
                        ${runtime.mining
                            ? "MINING"
                            : "NODE ONLINE"
                        }
                    </span>
                </div>

            </header>


            <main
                class="nova-main"
                id="top"
            >

                <!-- HERO / FLOW -->

                <section
                    class="hero-card activity-spotlight ${
                        runtime.mining
                            ? "spotlight-mining"
                            : ""
                    }"
                    id="activity"
                >

                    <div class="spotlight-orbit orbit-one"></div>
                    <div class="spotlight-orbit orbit-two"></div>

                    <span class="sparkle sparkle-one">
                        ✦
                    </span>

                    <span class="sparkle sparkle-two">
                        ✧
                    </span>


                    <div class="spotlight-topline">

                        <div>
                            <p class="eyebrow">
                                NOVACHAIN // LIVE NETWORK
                            </p>

                            <h1 class="spotlight-title">
                                ${escapeHtml(
                                    getHeadline(
                                        currentStage
                                    )
                                )}
                            </h1>
                        </div>

                        <div class="live-indicator">
                            <span class="live-pulse"></span>
                            LIVE
                        </div>

                    </div>


                    <p class="hero-description spotlight-description">
                        ${escapeHtml(
                            getDescription(
                                currentStage,
                                mempool.length
                            )
                        )}
                    </p>


                    <div
                        class="consensus-flow"
                        aria-label="NovaChain transaction lifecycle"
                    >
                        ${flowStep(
                            "CREATE",
                            "01",
                            currentStage,
                            [
                                "CREATE",
                                "SIGNING",
                                "MEMPOOL",
                                "MINING",
                                "CONFIRMED",
                            ]
                        )}

                        <span class="flow-arrow">
                            →
                        </span>

                        ${flowStep(
                            "SIGN",
                            "02",
                            currentStage,
                            [
                                "SIGNING",
                                "MEMPOOL",
                                "MINING",
                                "CONFIRMED",
                            ]
                        )}

                        <span class="flow-arrow">
                            →
                        </span>

                        ${flowStep(
                            "MEMPOOL",
                            "03",
                            currentStage,
                            [
                                "MEMPOOL",
                                "MINING",
                                "CONFIRMED",
                            ]
                        )}

                        <span class="flow-arrow">
                            →
                        </span>

                        ${flowStep(
                            "PROOF OF WORK",
                            "04",
                            currentStage,
                            [
                                "MINING",
                                "CONFIRMED",
                            ]
                        )}

                        <span class="flow-arrow">
                            →
                        </span>

                        ${flowStep(
                            "BLOCK",
                            "05",
                            currentStage,
                            [
                                "CONFIRMED",
                            ]
                        )}
                    </div>


                    <div class="operation-readout">

                        <div class="operation-icon">
                            ${stageIcon(currentStage)}
                        </div>

                        <div class="operation-copy">

                            <span class="operation-label">
                                CURRENT OPERATION
                            </span>

                            <strong>
                                ${escapeHtml(
                                    currentStage
                                )}
                            </strong>

                            <small>
                                ${escapeHtml(
                                    operationDetail(
                                        runtime,
                                        snapshot
                                    )
                                )}
                            </small>

                        </div>

                        <div class="operation-value">
                            ${
                                runtime.mining
                                    ? `
                                        <span class="operation-live">
                                            ● RUNNING
                                        </span>
                                    `
                                    : `
                                        <span>
                                            ● STABLE
                                        </span>
                                    `
                            }
                        </div>

                    </div>


                    ${
                        runtime.mining
                            ? renderMiningReadout(
                                runtime
                            )
                            : ""
                    }

                </section>


                <!-- WALLET -->

                <section
                    class="balance-card"
                    id="wallet"
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
                                ${formatNvc(
                                    balance
                                )}
                            </div>

                            <div class="balance-unit">
                                NVC
                            </div>

                            <div class="balance-subvalue">
                                ${formatInteger(
                                    balance
                                )} NNC
                            </div>

                        </div>


                        <div class="coin-display">
                            <div class="coin-face">
                                N
                            </div>
                            <span>
                                NVC
                            </span>
                        </div>

                    </div>


                    <div class="action-grid">

                        <button
                            class="action-tile action-send"
                            type="button"
                            data-action="send"
                        >
                            <span class="action-icon">
                                ↗
                            </span>

                            <span class="action-name">
                                SEND
                            </span>

                            <small>
                                CREATE TX
                            </small>
                        </button>


                        <button
                            class="action-tile action-mine"
                            type="button"
                            data-action="mine"
                            ${runtime.mining ? "disabled" : ""}
                        >
                            <span class="action-icon">
                                ${runtime.mining
                                    ? "◌"
                                    : "⛏"
                                }
                            </span>

                            <span class="action-name">
                                ${runtime.mining
                                    ? "MINING"
                                    : "MINE"
                                }
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
                            <span class="action-icon">
                                ↓
                            </span>

                            <span class="action-name">
                                RECEIVE
                            </span>

                            <small>
                                WALLET ADDRESS
                            </small>
                        </button>

                    </div>

                </section>


                <!-- TELEMETRY -->

                <section
                    class="network-card telemetry-card"
                    id="network"
                >

                    <div class="section-heading">
                        <span>☁</span>
                        <span>LOCAL NODE TELEMETRY</span>
                    </div>


                    <div class="network-grid">

                        ${metric(
                            "BLOCK HEIGHT",
                            blockHeight,
                            "#"
                        )}

                        ${metric(
                            "MEMPOOL",
                            mempool.length,
                            "TX"
                        )}

                        ${metric(
                            "CHAIN",
                            chainLength,
                            "BLOCKS"
                        )}

                        ${metric(
                            "UTXO",
                            networkState.getUTXOs().length,
                            "OUTPUTS"
                        )}

                    </div>

                </section>


                <!-- VISUAL CONSENSUS -->

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
                                Every highlighted state below
                                corresponds to a real local
                                blockchain operation.
                            </p>
                        </div>

                        <div class="consensus-status">
                            <span class="status-dot"></span>
                            ${escapeHtml(
                                currentStage
                            )}
                        </div>

                    </div>


                    <div class="consensus-rail">

                        ${consensusNode(
                            "01",
                            "WALLET",
                            "Transaction origin",
                            currentStage,
                            [
                                "CREATE",
                                "SIGNING",
                                "MEMPOOL",
                                "MINING",
                                "CONFIRMED",
                            ]
                        )}

                        <div class="consensus-connector"></div>

                        ${consensusNode(
                            "02",
                            "MEMPOOL",
                            `${mempool.length} pending transaction${mempool.length === 1 ? "" : "s"}`,
                            currentStage,
                            [
                                "MEMPOOL",
                                "MINING",
                                "CONFIRMED",
                            ]
                        )}

                        <div class="consensus-connector"></div>

                        ${consensusNode(
                            "03",
                            "MINER",
                            runtime.mining
                                ? `Searching nonce ${formatInteger(
                                    runtime.miningNonce
                                )}`
                                : "Awaiting work",
                            currentStage,
                            [
                                "MINING",
                                "CONFIRMED",
                            ]
                        )}

                        <div class="consensus-connector"></div>

                        ${consensusNode(
                            "04",
                            "CHAIN",
                            `Block #${blockHeight}`,
                            currentStage,
                            [
                                "CONFIRMED",
                            ]
                        )}

                    </div>

                </section>


                <!-- ACTIVITY -->

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
                            mempool
                        )}
                    </div>

                </section>                <!-- BLOCK -->

                <section class="block-card">

                    <div class="section-heading">
                        <span>▣</span>
                        <span>LATEST BLOCK</span>
                    </div>

                    ${renderBlock(
                        latestBlock
                    )}

                </section>


                <!-- NODE -->

                <section
                    class="node-card"
                    id="node"
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
                                    shortId(
                                        nodeIdentity.nodeId
                                    )
                                )}
                            </strong>

                            <small>
                                ${escapeHtml(
                                    nodeIdentity.nodeId
                                )}
                            </small>

                        </div>

                    </div>


                    <div class="address-panel">

                        <span class="metric-label">
                            WALLET ADDRESS
                        </span>

                        <div class="address-row">

                            <code>
                                ${escapeHtml(
                                    wallet.address
                                )}
                            </code>

                            <button
                                class="copy-button"
                                type="button"
                                data-action="copy"
                            >
                                COPY
                            </button>

                        </div>

                    </div>

                </section>


                <!-- RAW STATE -->

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
                            2
                        )
                    )}</pre>

                </details>

            </main>


            <!-- NAV -->

            <nav
                class="bottom-nav"
                aria-label="NovaChain navigation"
            >

                <button
                    class="nav-item active"
                    type="button"
                    data-scroll="top"
                >
                    <span>✦</span>
                    <small>HOME</small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-scroll="network"
                >
                    <span>◉</span>
                    <small>NETWORK</small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-scroll="wallet"
                >
                    <span>◎</span>
                    <small>WALLET</small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-scroll="activity-feed"
                >
                    <span>≋</span>
                    <small>ACTIVITY</small>
                </button>

                <button
                    class="nav-item"
                    type="button"
                    data-scroll="node"
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


        <!-- SEND MODAL -->

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
                    Create and sign a real transaction using
                    the local UTXO set.
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
                                min="0.000001"
                                step="0.000001"
                                placeholder="0.000000"
                                required
                            />

                            <strong>
                                NVC
                            </strong>

                        </div>

                    </label>


                    <div class="send-preview">

                        <div>
                            <span>
                                AVAILABLE
                            </span>

                            <strong id="send-available">
                                ${formatNvc(
                                    balance
                                )} NVC
                            </strong>
                        </div>

                        <div>
                            <span>
                                FLOW
                            </span>

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


        <!-- RECEIVE MODAL -->

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
                    Share this address with another NovaChain node.
                </p>

                <div class="receive-address">
                    <code>
                        ${escapeHtml(
                            wallet.address
                        )}
                    </code>
                </div>

                <button
                    class="primary-button"
                    type="button"
                    data-action="copy"
                >
                    COPY ADDRESS
                </button>

            </section>

        </div>
    `;
}


/*
|--------------------------------------------------------------------------
| Events
|--------------------------------------------------------------------------
*/

function bindEvents(runtime) {
    const {
        root,
    } = runtime;

    root.addEventListener(
        "click",
        async (event) => {
            const action =
                event.target.closest(
                    "[data-action]"
                );

            const scroll =
                event.target.closest(
                    "[data-scroll]"
                );

            if (scroll) {
                scrollTo(
                    scroll.dataset.scroll
                );

                updateNav(
                    root,
                    scroll.dataset.scroll
                );

                return;
            }

            if (!action) {
                return;
            }

            switch (
                action.dataset.action
            ) {
                case "send":
                    openModal(
                        "send-modal"
                    );
                    break;

                case "mine":
                    await handleMine(
                        runtime
                    );
                    break;

                case "receive":
                    openModal(
                        "receive-modal"
                    );
                    break;

                case "copy":
                    await copyAddress(
                        runtime
                    );
                    break;

                case "close-send":
                    closeModal(
                        "send-modal"
                    );
                    break;

                case "close-receive":
                    closeModal(
                        "receive-modal"
                    );
                    break;

                default:
                    break;
            }
        }
    );

    root.addEventListener(
        "submit",
        async (event) => {
            if (
                event.target.id !==
                "send-form"
            ) {
                return;
            }

            event.preventDefault();

            await handleSend(
                runtime,
                event.target
            );
        }
    );

    document.addEventListener(
        "keydown",
        (event) => {
            if (
                event.key !== "Escape"
            ) {
                return;
            }

            closeModal(
                "send-modal"
            );

            closeModal(
                "receive-modal"
            );
        }
    );
}


/*
|--------------------------------------------------------------------------
| Send
|--------------------------------------------------------------------------
*/

async function handleSend(
    runtime,
    form
) {
    const recipient =
        form.querySelector(
            "#recipient-address"
        ).value.trim();

    const amountNvc =
        Number(
            form.querySelector(
                "#send-amount"
            ).value
        );

    const submit =
        form.querySelector(
            "#send-submit"
        );

    if (!recipient) {
        showToast(
            runtime,
            "Recipient address is required.",
            "error"
        );

        return;
    }

    if (
        !Number.isFinite(
            amountNvc
        ) ||
        amountNvc <= 0
    ) {
        showToast(
            runtime,
            "Enter a valid NVC amount.",
            "error"
        );

        return;
    }

    const amountNnc =
        Math.round(
            amountNvc *
            NNC_PER_NVC
        );

    if (
        !Number.isSafeInteger(
            amountNnc
        ) ||
        amountNnc <= 0
    ) {
        showToast(
            runtime,
            "Amount is outside the supported range.",
            "error"
        );

        return;
    }

    try {
        submit.disabled = true;
        submit.textContent =
            "CREATING...";

        setStage(
            runtime,
            "CREATE",
            "Transaction construction started."
        );

        render(runtime);

        await nextFrame();

        submit.textContent =
            "SIGNING...";

        setStage(
            runtime,
            "SIGNING",
            "Wallet is signing the transaction."
        );

        render(runtime);

        await nextFrame();

        const transaction =
            await runtime.networkState.createPayment({
                wallet:
                    runtime.wallet,

                recipientAddress:
                    recipient,

                amount:
                    amountNnc,
            });

        addActivity(
            runtime,
            {
                type: "transaction",
                title:
                    "Transaction entered mempool",
                detail:
                    `TX ${shortId(
                        transaction.id
                    )} · ${formatNvc(
                        amountNnc
                    )} NVC`,
                timestamp:
                    Date.now(),
                txId:
                    transaction.id,
            }
        );

        setStage(
            runtime,
            "MEMPOOL",
            "Signed transaction is waiting for mining."
        );

        showToast(
            runtime,
            "Transaction signed and added to mempool.",
            "success"
        );

        closeModal(
            "send-modal"
        );

        form.reset();

        render(runtime);

    } catch (error) {
        console.error(
            "NovaChain transaction failed:",
            error
        );

        setStage(
            runtime,
            "READY",
            getErrorMessage(error)
        );        showToast(
            runtime,
            getErrorMessage(error),
            "error"
        );

        render(runtime);

    } finally {
        const currentSubmit =
            document.querySelector(
                "#send-submit"
            );

        if (currentSubmit) {
            currentSubmit.disabled =
                false;

            currentSubmit.textContent =
                "SIGN & BROADCAST";
        }
    }
}


/*
|--------------------------------------------------------------------------
| Mining
|--------------------------------------------------------------------------
*/

async function handleMine(
    runtime
) {
    if (runtime.mining) {
        return;
    }

    const pending =
        runtime.networkState
            .getMempoolTransactions();

    runtime.mining =
        true;

    runtime.miningStartedAt =
        Date.now();

    runtime.miningNonce =
        0;

    runtime.miningHash =
        "";

    setStage(
        runtime,
        "MINING",
        pending.length
            ? `${pending.length} transaction(s) selected.`
            : "No pending payments. Mining coinbase reward block."
    );

    addActivity(
        runtime,
        {
            type: "mining",
            title:
                "Proof of Work started",
            detail:
                pending.length
                    ? `${pending.length} pending transaction(s) plus miner reward.`
                    : "Coinbase-only block plus miner reward.",
            timestamp:
                Date.now(),
        }
    );

    render(runtime);

    try {
        const block =
            await runtime.networkState.minePendingTransactions({
                minerAddress:
                    runtime.wallet.address,

                difficulty:
                    3,

                onProgress:
                    (progress) => {
                        runtime.miningNonce =
                            progress.nonce ??
                            0;

                        runtime.miningHash =
                            progress.hash ??
                            "";

                        renderMiningLive(
                            runtime
                        );
                    },
            });

        runtime.mining =
            false;

        runtime.lastBlockHeight =
            block.index;

        setStage(
            runtime,
            "CONFIRMED",
            `Block #${block.index} accepted by the local chain.`
        );

        addActivity(
            runtime,
            {
                type: "block",
                title:
                    `Block #${block.index} confirmed`,
                detail:
                    `PoW satisfied · nonce ${block.nonce} · ${block.transactions.length} transaction(s)`,
                timestamp:
                    Date.now(),
            }
        );

        addActivity(
            runtime,
            {
                type: "reward",
                title:
                    "Mining reward credited",
                detail:
                    "+50,000 NNC · +0.500000 NVC",
                timestamp:
                    Date.now(),
            }
        );

        showToast(
            runtime,
            `Block #${block.index} mined successfully.`,
            "success"
        );

        render(runtime);

        window.setTimeout(
            () => {
                if (
                    runtime.mining
                ) {
                    return;
                }

                setStage(
                    runtime,
                    "READY",
                    "Node is ready."
                );

                render(runtime);
            },
            2200
        );

    } catch (error) {
        runtime.mining =
            false;

        console.error(
            "NovaChain mining failed:",
            error
        );

        setStage(
            runtime,
            "READY",
            getErrorMessage(error)
        );

        addActivity(
            runtime,
            {
                type: "error",
                title:
                    "Mining failed",
                detail:
                    getErrorMessage(error),
                timestamp:
                    Date.now(),
            }
        );

        showToast(
            runtime,
            getErrorMessage(error),
            "error"
        );

        render(runtime);
    }
}


/*
|--------------------------------------------------------------------------
| Refresh
|--------------------------------------------------------------------------
*/

function startRefresh(
    runtime
) {
    runtime.refreshTimer =
        window.setInterval(
            () => {
                if (
                    !runtime.root
                        .isConnected
                ) {
                    window.clearInterval(
                        runtime.refreshTimer
                    );

                    return;
                }

                const height =
                    getBlockHeight(
                        runtime.networkState
                    );

                if (
                    height !==
                    runtime.lastBlockHeight
                ) {
                    runtime.lastBlockHeight =
                        height;

                    if (
                        !runtime.mining
                    ) {
                        setStage(
                            runtime,
                            "CONFIRMED",
                            `Block #${height} became the latest local block.`
                        );

                        render(runtime);
                    }
                }

                updateCounters(
                    runtime
                );
            },
            700
        );
}


/*
|--------------------------------------------------------------------------
| Render helpers
|--------------------------------------------------------------------------
*/

function flowStep(
    label,
    number,
    currentStage,
    completedStages
) {
    const active =
        currentStage ===
        labelToStage(label);

    const complete =
        completedStages.includes(
            currentStage
        );

    return `
        <div
            class="flow-stage ${
                complete
                    ? "is-complete"
                    : ""
            } ${
                active
                    ? "is-active"
                    : ""
            }"
        >
            <span class="flow-number">
                ${number}
            </span>

            <span class="flow-label">
                ${escapeHtml(
                    label
                )}
            </span>
        </div>
    `;
}


function consensusNode(
    number,
    title,
    detail,
    currentStage,
    activeStages
) {
    const active =
        activeStages.includes(
            currentStage
        );

    const complete =
        currentStage ===
        "CONFIRMED" &&
        activeStages.includes(
            "CONFIRMED"
        );

    return `
        <div
            class="consensus-node ${
                active
                    ? "is-active"
                    : ""
            } ${
                complete
                    ? "is-complete"
                    : ""
            }"
        >
            <span class="consensus-number">
                ${number}
            </span>

            <div class="consensus-node-body">
                <strong>
                    ${escapeHtml(
                        title
                    )}
                </strong>

                <small>
                    ${escapeHtml(
                        detail
                    )}
                </small>
            </div>
        </div>
    `;
}


function metric(
    label,
    value,
    unit
) {
    return `
        <div class="metric">
            <span class="metric-label">
                ${escapeHtml(
                    label
                )}
            </span>

            <strong>
                ${escapeHtml(
                    String(value)
                )}
            </strong>

            <small>
                ${escapeHtml(
                    unit
                )}
            </small>
        </div>
    `;
}


function renderActivity(
    activities,
    mempool
) {
    const entries = [
        ...activities,
    ];

    for (
        const transaction
        of mempool
    ) {
        if (
            !entries.some(
                (entry) =>
                    entry.txId ===
                    transaction.id
            )
        ) {
            entries.push({
                type: "pending",
                title:
                    "Transaction pending",
                detail:
                    `TX ${shortId(
                        transaction.id
                    )}`,
                timestamp:
                    Date.now(),
                txId:
                    transaction.id,
            });
        }
    }

    entries.sort(
        (a, b) =>
            b.timestamp -
            a.timestamp
    );

    const visible =
        entries.slice(
            0,
            8
        );

    return visible.length
        ? visible
            .map(
                (entry) => `
                    <article
                        class="activity-item activity-${escapeHtml(
                            entry.type
                        )}"
                    >
                        <div class="activity-icon">
                            ${activityIcon(
                                entry.type
                            )}
                        </div>

                        <div class="activity-copy">
                            <strong>
                                ${escapeHtml(
                                    entry.title
                                )}
                            </strong>

                            <small>
                                ${escapeHtml(
                                    entry.detail
                                )}
                            </small>
                        </div>

                        <time>
                            ${relativeTime(
                                entry.timestamp
                            )}
                        </time>
                    </article>
                `
            )
            .join("")
        : `
            <div class="empty-state">
                <span>☁</span>
                <strong>
                    No activity yet.
                </strong>
                <small>
                    The node is waiting for an operation.
                </small>
            </div>
        `;
}


function renderBlock(
    block
) {
    if (!block) {
        return `
            <div class="empty-state">
                <span>▣</span>
                <strong>
                    No block available.
                </strong>
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
                        String(
                            block.index
                        )
                    )}
                </strong>

            </div>


            <div class="block-details">

                <div>
                    <span>
                        HASH
                    </span>

                    <code>
                        ${escapeHtml(
                            shortId(
                                block.hash
                            )
                        )}
                    </code>
                </div>


                <div>
                    <span>
                        MERKLE ROOT
                    </span>

                    <code>
                        ${escapeHtml(
                            shortId(
                                block.merkleRoot
                            )
                        )}
                    </code>
                </div>


                <div>
                    <span>
                        DIFFICULTY
                    </span>

                    <strong>
                        ${escapeHtml(
                            String(
                                block.difficulty ??
                                0
                            )
                        )}
                    </strong>
                </div>


                <div>
                    <span>
                        TRANSACTIONS
                    </span>

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
| Mining live UI
|--------------------------------------------------------------------------
*/

function renderMiningLive(
    runtime
) {
    const spotlight =
        runtime.root.querySelector(
            ".activity-spotlight"
        );

    if (!spotlight) {
        return;
    }

    spotlight.classList.add(
        "spotlight-mining"
    );

    const readout =
        spotlight.querySelector(
            ".mining-readout"
        );

    if (readout) {
        readout.outerHTML =
            renderMiningReadout(
                runtime
            );
    }
}


function renderMiningReadout(
    runtime
) {
    const elapsed =
        runtime.miningStartedAt
            ? Date.now() -
                runtime.miningStartedAt
            : 0;

    return `
        <div class="mining-readout">

            <div class="mining-topline">

                <span>
                    ⛏ PROOF OF WORK SEARCH
                </span>

                <strong>
                    DIFFICULTY 3
                </strong>            </div>


            <div class="mining-main">

                <div class="nonce-display">
                    <span>
                        NONCE
                    </span>

                    <strong>
                        ${formatInteger(
                            runtime.miningNonce
                        )}
                    </strong>
                </div>


                <div class="hash-display">

                    <span>
                        LATEST HASH
                    </span>

                    <code>
                        ${escapeHtml(
                            runtime.miningHash ||
                            "SEARCHING..."
                        )}
                    </code>

                </div>


                <div class="mining-time">

                    <span>
                        ELAPSED
                    </span>

                    <strong>
                        ${(
                            elapsed /
                            1000
                        ).toFixed(1)}s
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


function updateCounters(
    runtime
) {
    const balance =
        runtime.networkState.getBalance(
            runtime.wallet.address
        );

    const balanceElement =
        runtime.root.querySelector(
            ".balance-number"
        );

    if (balanceElement) {
        balanceElement.textContent =
            formatNvc(balance);
    }

    const values = [
        getBlockHeight(
            runtime.networkState
        ),

        runtime.networkState
            .getMempoolTransactions()
            .length,

        runtime.networkState
            .getChain()
            .length,

        runtime.networkState
            .getUTXOs()
            .length,
    ];

    runtime.root
        .querySelectorAll(
            ".telemetry-card .metric strong"
        )
        .forEach(
            (element, index) => {
                element.textContent =
                    String(
                        values[index]
                    );
            }
        );
}


/*
|--------------------------------------------------------------------------
| Stage state
|--------------------------------------------------------------------------
*/

function setStage(
    runtime,
    stage,
    detail
) {
    runtime.stage =
        stage;

    if (!detail) {
        return;
    }

    addActivity(
        runtime,
        {
            type:
                stage === "MINING"
                    ? "mining"
                    : "system",
            title:
                `State: ${stage}`,
            detail,
            timestamp:
                Date.now(),
        }
    );
}


function labelToStage(
    label
) {
    const values = {
        CREATE:
            "CREATE",
        SIGN:
            "SIGNING",
        MEMPOOL:
            "MEMPOOL",
        "PROOF OF WORK":
            "MINING",
        BLOCK:
            "CONFIRMED",
    };

    return (
        values[label] ??
        label
    );
}


/*
|--------------------------------------------------------------------------
| UI utilities
|--------------------------------------------------------------------------
*/

function openModal(
    id
) {
    const element =
        document.getElementById(
            id
        );

    if (!element) {
        return;
    }

    element.hidden =
        false;

    window.requestAnimationFrame(
        () => {
            element.classList.add(
                "is-open"
            );

            element.querySelector(
                "input"
            )?.focus();
        }
    );
}


function closeModal(
    id
) {
    const element =
        document.getElementById(
            id
        );

    if (!element) {
        return;
    }

    element.classList.remove(
        "is-open"
    );

    window.setTimeout(
        () => {
            element.hidden =
                true;
        },
        160
    );
}


async function copyAddress(
    runtime
) {
    try {
        await navigator.clipboard.writeText(
            runtime.wallet.address
        );

        showToast(
            runtime,
            "Wallet address copied.",
            "success"
        );
    } catch {
        showToast(
            runtime,
            "Could not copy the wallet address.",
            "error"
        );
    }
}


function showToast(
    runtime,
    message,
    type = "info"
) {
    const toast =
        runtime.root.querySelector(
            "#nova-toast"
        );

    if (!toast) {
        return;
    }

    toast.textContent =
        message;

    toast.dataset.type =
        type;

    toast.classList.add(
        "is-visible"
    );

    window.clearTimeout(
        toast._novaTimer
    );

    toast._novaTimer =
        window.setTimeout(
            () => {
                toast.classList.remove(
                    "is-visible"
                );
            },
            2800
        );
}


function addActivity(
    runtime,
    entry
) {
    runtime.activity.unshift(
        entry
    );

    runtime.activity =
        runtime.activity.slice(
            0,
            20
        );
}


function scrollTo(
    target
) {
    if (
        target ===
        "top"
    ) {
        window.scrollTo({
            top: 0,
            behavior:
                "smooth",
        });

        return;
    }

    document.getElementById(
        target
    )?.scrollIntoView({
        behavior:
            "smooth",
        block:
            "start",
    });
}


function updateNav(
    root,
    target
) {
    root.querySelectorAll(
        ".nav-item"
    ).forEach(
        (item) => {
            item.classList.toggle(
                "active",
                item.dataset.scroll ===
                    target
            );
        }
    );
}


/*
|--------------------------------------------------------------------------
| Runtime
|--------------------------------------------------------------------------
*/

function getSnapshot(
    networkState
) {
    return networkState
        .getStateSnapshot();
}


function getBlockHeight(
    networkState
) {
    return (
        networkState
            .getLatestBlock()
            ?.index ?? 0
    );
}


/*
|--------------------------------------------------------------------------
| Formatting
|--------------------------------------------------------------------------
*/

function formatNvc(
    nnc
) {
    return Number(
        nnc / NNC_PER_NVC
    ).toLocaleString(
        "en-IN",
        {
            minimumFractionDigits:
                6,
            maximumFractionDigits:
                6,
        }
    );
}


function formatInteger(
    value
) {
    return Number(
        value ?? 0
    ).toLocaleString(
        "en-IN"
    );
}


function shortId(
    value
) {
    if (!value) {
        return "—";
    }

    const text =
        String(value);

    if (
        text.length <= 18
    ) {
        return text;
    }

    return (
        text.slice(0, 9) +
        "…" +
        text.slice(-7)
    );
}


function relativeTime(
    timestamp
) {
    const delta =
        Math.max(
            0,
            Date.now() -
                timestamp
        );

    if (delta < 1000) {
        return "now";
    }

    if (
        delta < 60_000
    ) {
        return (
            Math.floor(
                delta / 1000
            ) + "s"
        );
    }

    if (
        delta < 3_600_000
    ) {
        return (
            Math.floor(
                delta /
                    60_000
            ) + "m"
        );
    }

    return (
        Math.floor(
            delta /
                3_600_000
        ) + "h"
    );
}


/*
|--------------------------------------------------------------------------
| Copy safety
|--------------------------------------------------------------------------
*/

function escapeHtml(
    value
) {
    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


function getErrorMessage(
    error
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
| Copy
|--------------------------------------------------------------------------
*/

function getHeadline(
    stage
) {
    const values = {
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
        values[stage] ??
        "WATCH THE NETWORK MOVE."
    );
}


function getDescription(
    stage,
    mempoolSize
) {
    if (
        stage ===
        "MEMPOOL"
    ) {
        return `${mempoolSize} transaction${mempoolSize === 1 ? "" : "s"} currently waiting for inclusion.`;
    }

    const values = {
        READY:
            "Your browser node is connected to its local ledger. Mine a block to create the first real UTXO and reward.",
        CREATE:
            "The wallet is constructing a payment from spendable UTXOs.",
        SIGNING:
            "The wallet is signing the payment with its persistent local keypair.",
        MINING:
            "The miner is repeatedly hashing the block header until the Proof of Work target is satisfied.",
        CONFIRMED:
            "A valid block has been accepted and the local UTXO state has been updated.",
    };

    return (
        values[stage] ??
        "NovaChain is processing local blockchain state."
    );
}


function operationDetail(
    runtime,
    snapshot
) {
    if (
        runtime.mining
    ) {
        return `Nonce ${formatInteger(
            runtime.miningNonce
        )} · ${
            runtime.miningHash
                ? shortId(
                    runtime.miningHash
                )
                : "searching hash"
        }`;
    }

    if (
        runtime.stage ===
        "MEMPOOL"
    ) {
        return `${snapshot.mempool.length} pending transaction(s)`;
    }

    if (
        runtime.stage ===
        "CONFIRMED"
    ) {
        return `Block #${snapshot.chainHeight} is now the latest local block`;
    }

    return `Block #${snapshot.chainHeight} · local node ready`;
}


function stageIcon(
    stage
) {
    const values = {
        READY: "✦",
        CREATE: "＋",
        SIGNING: "⌁",
        MEMPOOL: "≋",
        MINING: "⛏",
        CONFIRMED: "✓",
    };

    return (
        values[stage] ??
        "✦"
    );
}


function activityIcon(
    type
) {
    const values = {
        system: "✦",
        transaction: "↗",
        mining: "⛏",
        block: "▣",
        reward: "★",
        pending: "☁",
        error: "!",
    };

    return (
        values[type] ??
        "•"
    );
}


function nextFrame() {
    return new Promise(
        (resolve) =>
            window.requestAnimationFrame(
                resolve
            )
    );
}