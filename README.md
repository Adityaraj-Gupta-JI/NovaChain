# NovaChain

A browser-native decentralized payment network with a visual consensus engine for blockchain education.

**Learn blockchain by watching it work.**

[Live Demo](https://novachain.adityarajgupta459.workers.dev)

## About

NovaChain is an educational blockchain project that implements core payment network mechanics directly in the browser. Each browser node maintains its own identity and wallet, creates and signs transactions, manages a mempool and local UTXO state, performs proof of work, validates blocks, and observes ledger changes in real time.

The project is designed for learners, demonstrations, and academic exploration rather than as a replacement for production blockchain networks.

## Why NovaChain?

Blockchain concepts are often taught through diagrams and terminology without demonstrating actual execution. NovaChain takes a different approach by letting users interact with a real local node and observe the complete transaction lifecycle:

```
Wallet → Transaction → Signature → Mempool → Proof of Work → Block → Validation → UTXO Set → Balance
```

This transforms blockchain from a theoretical subject into something learners can inspect while it runs.

## The Problem

Learning blockchain often creates a gap between understanding terminology and understanding actual execution flow. Students may know what a block, transaction, hash, miner, or consensus mechanism is without seeing how these pieces interact as a system.

## The Solution

NovaChain builds important primitives as application-level components, making the underlying state visible. Learners can observe the complete flow and inspect the resulting blockchain, UTXO state, wallet balance, and node state. The interface is intentionally visual because the project is not only a payment prototype—it is a visual consensus engine for blockchain education.

## Core Features

- Browser-native nodes with persistent public node identities
- Local cryptographic wallets using browser cryptography
- SHA-256 hashing and transaction signing
- UTXO-based transaction model
- Transaction mempool with pending-spend protection
- Proof of work mining
- Block and Merkle-root validation
- Coinbase rewards using NovaCoin (NVC)
- NanoNovaCoin (NNC) as the smallest unit
- IndexedDB persistence for local blockchain state
- NCCP (NovaChain Communication Protocol)
- Multi-node communication architecture
- Visual consensus engine for observing blockchain state transitions
- Live deployment through Cloudflare Workers

## System Architecture

```
                           NOVACHAIN

                 ┌──────────────────────────┐
                 │       Browser Node       │
                 │                          │
                 │  Node Identity           │
                 │  Wallet / Keys           │
                 │  Transactions            │
                 │  Mempool                 │
                 │  Blockchain              │
                 │  UTXO Set                │
                 │  Proof of Work           │
                 │  IndexedDB Persistence   │
                 └────────────┬─────────────┘
                              │
                         NCCP Messages
                              │
                              ▼
                 ┌──────────────────────────┐
                 │   Network Coordination   │
                 │                          │
                 │   Cloudflare Worker      │
                 │   NCCP Hub / DO          │
                 └────────────┬─────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
            Browser Node B          Browser Node C
```

**Architectural Principle:** The coordination layer is not the blockchain database. Browser nodes maintain their own local blockchain state while network infrastructure assists communication and peer coordination. This distinction is important to NovaChain's goal of exploring decentralized systems rather than simply building a centralized database with a blockchain-themed UI.

## NovaCoin

NovaChain uses its own educational currency:

| Unit | Meaning            |
|------|-------------------|
| NVC  | NovaCoin          |
| NNC  | NanoNovaCoin      |

1 NVC = 100,000 NNC

Transactions are represented internally using the smallest unit to avoid unnecessary floating-point behavior.

## NovaChain Communication Protocol

NCCP (NovaChain Communication Protocol) handles node-to-node communication and is responsible for exchanging:

- Node presence
- Transaction announcements
- Blockchain state
- Synchronization requests
- Block propagation

The protocol and peer architecture are being developed incrementally as the MVP evolves.

## Why Not Ethereum or Hyperledger?

Ethereum and Hyperledger are powerful platforms, but using an existing blockchain platform would hide many of the mechanisms NovaChain is intended to teach. NovaChain deliberately implements its own simplified primitives so learners can inspect:

- Hashing
- Signatures
- Transaction construction
- UTXOs
- Mempool behavior
- Proof of work
- Block validation
- Synchronization
- Peer communication

The goal is not to compete with established blockchain platforms but to make blockchain internals understandable by implementing and visualizing them directly.

## Getting Started

### Live Deployment

Open the current deployment at [https://novachain.adityarajgupta459.workers.dev](https://novachain.adityarajgupta459.workers.dev)

### Local Development

Clone the repository:

```bash
git clone https://github.com/Adityaraj-Gupta-JI/NovaChain.git
cd NovaChain
```

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Build the application:

```bash
npm run build
```

Deploy to Cloudflare Workers:

```bash
npx wrangler deploy
```

Cloudflare Workers supports deploying Worker code together with static assets through the Workers Static Assets model.

## Typical Demonstration Flow

A simple NovaChain demonstration can follow this sequence:

1. Start the node
2. Inspect node identity
3. Inspect wallet
4. Mine the initial block
5. Observe the reward
6. Create a transaction
7. Watch it enter the mempool
8. Mine the transaction into a block
9. Observe UTXO changes
10. Observe the resulting balance
11. Inspect the updated chain state

The dashboard is intentionally built around this lifecycle so the visible interface corresponds to actual runtime state rather than simulated blockchain activity.

## Technology Stack

| Layer          | Technology                      |
|----------------|---------------------------------|
| Language       | JavaScript                      |
| Frontend       | Vite                            |
| UI             | HTML + CSS + JavaScript         |
| Cryptography   | Web Crypto API                  |
| Hashing        | SHA-256                         |
| Signatures     | ECDSA P-256                     |
| Ledger Model   | UTXO                            |
| Persistence    | IndexedDB                       |
| Networking     | WebSocket / NCCP                |
| Coordination   | Cloudflare Workers + Durable Objects |
| Deployment     | Cloudflare Workers              |
| Version Control| Git + GitHub                    |

## Project Structure

```
NovaChain/
├── cloudflare/
│   └── worker.js
├── public/
├── signaling-server/
├── src/
│   ├── app/
│   ├── components/
│   ├── consensus/
│   ├── core/
│   │   ├── block/
│   │   ├── crypto/
│   │   ├── identity/
│   │   ├── mempool/
│   │   ├── mining/
│   │   ├── state/
│   │   ├── transaction/
│   │   └── wallet/
│   ├── network/
│   ├── pages/
│   ├── storage/
│   ├── styles/
│   └── main.js
├── wrangler.jsonc
├── package.json
└── README.md
```

## Current Status

NovaChain is an active MVP.

### Implemented

- Node identity
- Wallet generation and persistence
- Hashing and signatures
- Transactions
- UTXO management
- Mempool
- Blocks
- Merkle roots
- Proof of work
- Local blockchain persistence
- Dashboard / Visual consensus engine
- Initial multi-node communication infrastructure
- Cloudflare Workers deployment

### In Progress

- Reliable multi-node state synchronization
- Robust peer lifecycle management
- Browser-to-browser communication improvements
- Production-ready network coordination
- Stronger persistence and conflict handling
- CI/CD preview and production workflow

## Future Scope

NovaChain is intended to evolve toward a more capable educational decentralized network with:

- Richer browser-to-browser P2P communication
- Stronger peer discovery
- Improved chain synchronization
- Better consensus conflict handling
- Transaction and block propagation visualizations
- Deeper protocol inspection
- Educational experiments and demonstrations
- Expanded documentation and research material

The architecture is intentionally incremental so new features can be added without hiding the underlying blockchain mechanisms.

## Inspiration

NovaChain was inspired by a simple question: What would blockchain education look like if the student could actually watch the protocol execute?

The project combines blockchain implementation with visual systems thinking. Instead of presenting consensus as an abstract diagram, NovaChain aims to let learners see a transaction move through the system and understand why each stage exists.

## Security & Privacy

Private wallet material is intended to remain local to the browser.

NovaChain is an educational MVP and should not be treated as a production financial network or used to store real funds.

Do not use real-world credentials, private keys, or sensitive financial information in development or demonstrations.

## 📜 License

Copyright © 2026 Adityaraj Gupta. All rights reserved.

NovaChain is proprietary software. No permission is granted to copy,
modify, distribute, sublicense, commercially use, or create derivative
works from this project without prior written permission from the owner.

Third-party components, libraries, and assets remain subject to their
respective licenses.

See [`LICENSE`](LICENSE) for the complete terms.

## Author

Adityaraj Gupta

NovaChain is an independently developed academic and engineering project exploring blockchain implementation, distributed systems, browser-native networking, and visual blockchain education.