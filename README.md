# Retail Sync

> **Cloud-Based Multi-Tenant Retail Management Platform (ERP & POS)**  
> **Development Phase:** Phase 1 Complete (Foundation, Tooling, Authentication & Multi-Tenancy)  
> **Target Deployment:** Vercel (Web Frontend) + Firebase Cloud Functions v2 (asia-south1) + Cloud Firestore (asia-south1)

---

## 1. Project Overview & Architecture

Retail Sync is a modern, enterprise-grade retail ERP and POS platform architected as a **Multi-Tenant Modular Monolith**. It supports multiple retail business categories (Grocery, Textile, Hardware, Electrical, Wholesale, and General Retail) on a unified codebase through dynamic, data-driven industry profiles.

### Core Architectural Pillars
- **Zero Client Trust:** The frontend is treated as an untrusted presentation surface. All pricing, inventory mutations, role assignments, and sequential numbering are strictly verified server-side.
- **Authoritative Membership Verification:** Role-based access control (RBAC) is governed authoritatively by `/userMemberships/{userId}_{orgId}` in Firestore. JWT custom claims are supplementary only.
- **Transactional & Immutable Financial Records:** Sales, stock movements, and sequential counters run inside ACID transactions. Committed records are immutable; adjustments require compensatory reversal vouchers.
- **Organization & Store Hierarchy:** Master catalogs, configurations, and inventory balances are cleanly partitioned under `/organizations/{orgId}`.

---

## 2. Project Monorepo Structure

```text
RetailSync/
├── docs/                         # Authoritative architecture documentation
│   ├── PROJECT_OVERVIEW.md       # Product vision, market scope, and business rules
│   ├── SYSTEM_ARCHITECTURE.md    # System topology, compute layer, and POS request flow
│   ├── FIRESTORE_DATABASE_DESIGN.md # Collections, schemas, transaction & retry mechanics
│   ├── SECURITY_ARCHITECTURE.md  # Zero-trust auth, RBAC matrix, and security test cases
│   ├── DEVELOPMENT_ROADMAP.md    # Phased execution milestones and exit criteria
│   └── TECH_STACK.md             # Curated stack versions and Architecture Decision Records
├── functions/                    # Firebase Cloud Functions v2 Backend Workspace
│   ├── src/
│   │   ├── config/               # Firebase Admin SDK initialization
│   │   ├── middleware/           # Auth, RBAC, store access, and audit logging
│   │   ├── modules/              # Domain-driven Cloud Function modules
│   │   │   ├── auth/             # User profile synchronization
│   │   │   ├── organizations/    # Organization provisioning & fiscal settings
│   │   │   ├── stores/           # Store branch creation
│   │   │   └── memberships/      # Team invitation & role management
│   │   ├── shared/               # Shared TypeScript types, Zod schemas, errors
│   │   └── index.ts              # Exported Cloud Functions v2 callables
│   ├── package.json
│   └── tsconfig.json
├── public/                       # Static public assets
├── scripts/
│   └── seed-emulator.js          # Safe demo seed data generator for local emulators
├── src/                          # Web Frontend Workspace (React 18 + Vite + TS)
│   ├── components/               # Enterprise design system
│   │   ├── common/               # Button, Input, Select, Card, Badge, Modal
│   │   └── layout/               # AppLayout, Sidebar, Header, StoreSwitcher
│   ├── config/                   # Firebase Web SDK client & emulator connection
│   ├── i18n/                     # Internationalization (English, Tamil, Hindi)
│   ├── modules/                  # Application feature modules
│   │   ├── auth/                 # Login, Register, ForgotPassword, ProtectedRoute
│   │   ├── organization/         # OrganizationSetup, StoreSetup, TeamMembers, Settings
│   │   └── dashboard/            # Real-time metrics overview
│   ├── services/                 # Firebase Auth & Firestore/Callable client services
│   ├── stores/                   # Zustand global stores (authStore)
│   ├── types/                    # Frontend TypeScript type declarations
│   ├── App.tsx                   # React Router routing hierarchy
│   ├── index.css                 # Tailwind CSS directives
│   └── main.tsx                  # React DOM bootstrap
├── tests/
│   ├── unit/                     # Unit test suites (auth, organization, membership)
│   └── rules/                    # Firestore Security Rules tests (@firebase/rules-unit-testing)
├── firebase.json                 # Firebase Emulator & Functions hosting configuration
├── firestore.rules               # Restrictive multi-tenant Firestore security rules
├── firestore.indexes.json        # Firestore composite indexes
├── storage.rules                 # Cloud Storage bucket security rules
├── .firebaserc.example           # Firebase project environment mapping
├── .env.example                  # Environment variables template
├── package.json                  # Root monorepo workspace dependencies
├── pnpm-workspace.yaml           # pnpm monorepo workspace definition
├── tsconfig.json                 # Root TypeScript configuration
├── vite.config.ts                # Vite bundler configuration
└── README.md                     # Comprehensive project documentation
```

---

## 3. Technology Stack & Runtime Matrix

| Ecosystem | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | `20.x LTS` / `24.x` | Runtime execution engine |
| **Package Manager** | pnpm | `12.x` | Monorepo package management |
| **Frontend** | React + Vite + TS | `18.3.1` / `5.4.x` | Fast Single Page Application (SPA) |
| **Styling** | Tailwind CSS | `3.4.x` | Enterprise design tokens and density |
| **State Management**| Zustand + TanStack Query | `4.5.x` / `v5` | Local UI state + Server cache |
| **Forms & Validation**| React Hook Form + Zod | `7.x` / `3.23.x` | Uncontrolled inputs + schema validation |
| **Localization** | i18next | `23.x` | English, Tamil (தமிழ்), Hindi (हिन्दी) |
| **Backend Compute** | Firebase Functions v2 | `5.1.x` | Google Cloud Run serverless functions |
| **Backend SDK** | Firebase Admin SDK | `12.5.x` | Privileged server environment |
| **Database** | Cloud Firestore | Managed | Partitioned NoSQL document database |
| **Testing** | Vitest | `2.1.x` | Fast unit & integration runner |

---

## 4. Local Development & Firebase Emulator Setup

All development runs against the **Firebase Local Emulator Suite**. No production resources or cloud credentials are required.

### 4.1 Prerequisites
- Node.js 20 LTS or higher (`node -v`)
- pnpm (`npm install -g pnpm`)
- Java Runtime Environment (OpenJDK 17 or higher) for Firestore and Auth emulators (`java -version`)
- Firebase CLI (`npm install -g firebase-tools`)

### 4.2 Installation
```bash
# Clone the repository
git clone <repo-url>
cd RetailSync

# Install monorepo dependencies
pnpm install
```

### 4.3 Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
cp .firebaserc.example .firebaserc
```

`.env` defaults for local emulator mode:
```ini
VITE_APP_ENV=development
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIREBASE_AUTH_EMULATOR_HOST=http://127.0.0.1:9099
VITE_FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_FIRESTORE_EMULATOR_PORT=8080
VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST=http://127.0.0.1:5001
VITE_FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_STORAGE_EMULATOR_PORT=9199
```

### 4.4 Build Cloud Functions
```bash
npx --prefix functions tsc
```

### 4.5 Start Firebase Local Emulators
```bash
# Starts Auth, Firestore, Functions, and Storage Emulators with UI at http://127.0.0.1:4000
firebase emulators:start --only auth,firestore,functions,storage
```

### 4.6 Seed Safe Demo Data
In a separate terminal, seed pre-configured demo organizations, stores, and accounts:
```bash
node scripts/seed-emulator.js
```

**Pre-configured Demo Accounts:**
- **Owner:** `owner@retailsync.demo` / `Password@123`
- **Manager:** `manager@retailsync.demo` / `Password@123`
- **Cashier:** `cashier@retailsync.demo` / `Password@123`

### 4.7 Start Frontend Development Server
```bash
pnpm dev
# Opens at http://localhost:3000
```

---

## 5. Automated Testing Commands

```bash
# Run all unit tests (Auth, Organization, Membership RBAC)
pnpm test

# Run Firestore Security Rules tests against Firestore emulator
pnpm test:rules

# Run full TypeScript check (Frontend & Backend)
pnpm build
npx --prefix functions tsc

# Run ESLint linter
pnpm lint
```

---

## 6. Security & Tenant Isolation Architecture

### Authoritative Membership Check
1. On incoming privileged requests, Cloud Functions extract the authenticated UID.
2. The function authoritatively reads `/userMemberships/{userId}_{orgId}`.
3. Asserts `status === 'ACTIVE'`. If `SUSPENDED` or `INVITED`, request is rejected with `403 Forbidden`.
4. Asserts that the caller has the required granular permission and store assignment.

### Security Rules Highlights
- Direct client writes to `/userMemberships` are strictly forbidden (`allow write: if false`).
- Direct client writes to inventory, sales ledgers, stock movements, and sequential counters are strictly forbidden. All state mutations must pass through validated Cloud Functions v2.
- Cross-tenant reads and writes are blocked by checking `request.auth.token.orgId == orgId`.
#   r e t a i l _ s y n c  
 