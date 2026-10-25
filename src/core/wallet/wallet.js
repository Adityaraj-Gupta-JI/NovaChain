import { generateKeyPair } from "../crypto/keys.js";
import { sha256 } from "../crypto/hash.js";

const DB_NAME = "novachain-wallet";
const STORE_NAME = "wallets";
const WALLET_KEY = "default";
let walletPromise = null;

async function createAddress(publicKey) {
    const jwk = await crypto.subtle.exportKey("jwk", publicKey);
    const hash = await sha256(JSON.stringify(jwk));
    return `NVC${hash.slice(0, 40)}`;
}

function openWalletDatabase() {
    return new Promise((resolve, reject) => {
        if (!globalThis.indexedDB) {
            reject(new Error("IndexedDB is required for persistent wallets."));
            return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Wallet database upgrade is blocked."));
    });
}

function readWallet(db) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(WALLET_KEY);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
        tx.onabort = () => reject(tx.error);
    });
}

function writeWalletIfAbsent(db, wallet) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(WALLET_KEY);
        let result = null;
        request.onsuccess = () => {
            result = request.result ?? wallet;
            if (!request.result) store.add(wallet, WALLET_KEY);
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

async function validateWallet(wallet) {
    if (!wallet?.publicKey || !wallet?.privateKey || typeof wallet.address !== "string") {
        throw new Error("Stored wallet is invalid. Refusing to replace it automatically.");
    }
    const derived = await createAddress(wallet.publicKey);
    if (derived !== wallet.address) {
        throw new Error("Stored wallet address does not match its public key.");
    }
    return wallet;
}

async function loadOrCreateWallet() {
    const db = await openWalletDatabase();
    try {
        const existing = await readWallet(db);
        if (existing) return validateWallet(existing);

        const keyPair = await generateKeyPair();
        const candidate = {
            address: await createAddress(keyPair.publicKey),
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            createdAt: Date.now(),
        };
        // The readwrite transaction prevents two simultaneous tabs from
        // overwriting one another's wallet during first-time initialization.
        return validateWallet(await writeWalletIfAbsent(db, candidate));
    } finally {
        db.close();
    }
}

/** Load the same wallet after refresh; create one only on first visit. */
export function createWallet() {
    if (!walletPromise) {
        walletPromise = loadOrCreateWallet().catch((error) => {
            walletPromise = null;
            throw error;
        });
    }
    return walletPromise;
}
