import { networkState } from "../core/state/networkState.js";

const state = {
    network: structuredClone(networkState)
};

const listeners = new Set();

export function getState() {
    return state;
}

export function subscribe(listener) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

export function updateNetworkState(updates) {
    Object.assign(state.network, updates);

    notify();
}

function notify() {
    for (const listener of listeners) {
        listener(state);
    }
}