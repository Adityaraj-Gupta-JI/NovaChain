/**
 * NovaChain
 * Network State
 *
 * This file contains the initial local state of a NovaChain node.
 *
 * Important:
 * Nothing here represents fake network activity.
 * Until real peers exist, the node reports zero peers.
 */

export const networkState = {
    nodeStatus: "INITIALIZING",

    peerCount: 0,

    blockHeight: 0,

    mempoolSize: 0,

    synchronization: {
        status: "LOCAL_ONLY",
        progress: 0
    }
};