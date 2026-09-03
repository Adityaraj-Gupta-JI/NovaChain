const STORAGE_KEY = "novachain.node.identity";

/**
 * Generate a new persistent NovaChain node identity.
 *
 * The UUID is generated using the browser's cryptographically
 * secure randomUUID implementation.
 */
function createNodeIdentity() {
    if (!crypto.randomUUID) {
        throw new Error(
            "NovaChain requires a browser with crypto.randomUUID support."
        );
    }

    const now = new Date().toISOString();

    return {
        nodeId: crypto.randomUUID(),
        createdAt: now,
        version: 1
    };
}

/**
 * Load the node identity from persistent browser storage.
 */
function loadNodeIdentity() {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
        return null;
    }

    try {
        const identity = JSON.parse(stored);

        if (
            !identity ||
            typeof identity.nodeId !== "string" ||
            identity.nodeId.length === 0
        ) {
            console.warn("Invalid stored NovaChain node identity.");
            return null;
        }

        return identity;
    } catch (error) {
        console.error(
            "Failed to parse stored NovaChain node identity:",
            error
        );

        return null;
    }
}

/**
 * Persist the node identity locally.
 */
function saveNodeIdentity(identity) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

/**
 * Get the current node identity.
 *
 * If this is the first run, a new identity is generated and persisted.
 * Subsequent application launches restore the same identity.
 */
export function getNodeIdentity() {
    const existingIdentity = loadNodeIdentity();

    if (existingIdentity) {
        return existingIdentity;
    }

    const newIdentity = createNodeIdentity();

    saveNodeIdentity(newIdentity);

    return newIdentity;
}

/**
 * Explicitly remove the local node identity.
 *
 * This is mainly useful for development/testing.
 * Production UI should not expose this casually.
 */
export function resetNodeIdentity() {
    localStorage.removeItem(STORAGE_KEY);
}