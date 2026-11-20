# Retail Sync — Technology Stack & Architectural Decision Records

> **Document Status:** Authoritative — Phase 1 Complete  
> **Target Audience:** Engineering Leads, DevOps, Full-Stack Developers  
> **Last Updated:** 2026-11-20  

---

## 1. Technology Selection & Version Matrix

All libraries and runtimes have been curated to ensure high stability, long-term support (LTS), strict TypeScript compatibility, and zero deprecation overhead.

| Ecosystem | Technology | Selected Version | Role & Justification |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | `20.x LTS` / `24.x` | Long-term support, native fetch, V8 performance optimizations. |
| **Package Manager** | pnpm | `12.16.x` | High-efficiency monorepo package management and strict hoisting. |
| **Frontend Framework** | React | `18.3.x` | Industry standard UI component model with stable Concurrent Features. |
| **Build Tool** | Vite | `5.4.x` | Sub-second HMR, optimized Rollup bundling, ES module native. |
| **Language** | TypeScript | `5.5+` | Strict type safety across client, backend, and database models. |
| **Styling** | Tailwind CSS | `3.4.x` | Zero-runtime CSS, utility-first design system, compact production bundles. |
| **Icons** | Lucide React | `0.441.x` | Lightweight, tree-shakable, consistent enterprise icon set. |
| **Routing** | React Router | `6.26.x` | Declarative client-side routing with nested layouts and route guards. |
| **Server State** | TanStack Query | `v5.5x.x` | Automated caching, background refetching, and optimistic mutations. |
| **Client State** | Zustand | `4.5.x` | Ultra-lightweight (< 2KB), unopinionated, boilerplate-free state store. |
| **Form Handling** | React Hook Form | `7.53.x` | Uncontrolled form performance, zero re-render typing lag on POS inputs. |
| **Schema Validation** | Zod | `3.23.x` | Isomorphic type-inferred validation shared between client and backend. |
| **Internationalization**| i18next | `23.15.x` | Battle-tested localization supporting English, Tamil, and Hindi. |
| **Date & Time** | date-fns | `3.6.x` | Tree-shakable immutable date utility library (avoids Moment.js bloat). |
| **Backend Compute** | Firebase Functions v2| `5.1.x` | Google Cloud Run-backed serverless functions with concurrency. |
| **Backend SDK** | Firebase Admin SDK | `12.5.x` | Privileged server environment for Firestore, Auth, and Storage. |
| **Client Firebase SDK**| Firebase JS SDK | `10.14.x` | Modular, tree-shakable client SDK for Auth, Firestore, and App Check. |
| **Testing** | Vitest + Rules Testing | `2.1.x` / `3.0.x`| Fast ESM unit testing (Vitest) and `@firebase/rules-unit-testing`. |

---

## 2. Architectural Decision Records (ADRs)

### ADR-01: React SPA (Vite) vs. Next.js (SSR / Hybrid)
- **Decision:** **Adopt React 18 SPA powered by Vite; explicitly reject Next.js.**
- **Rationale:** Operational POS systems require client resilience against brief server disruptions. A static SPA loads once, works against local/edge services, and avoids SSR cold starts.

### ADR-02: Server State (TanStack Query) + Client State (Zustand) vs. Redux Toolkit
- **Decision:** **Adopt TanStack Query v5 for server data + Zustand for local UI state; reject Redux.**
- **Rationale:** Automatic cache invalidation, zero boilerplate, and < 2KB bundle footprint for Zustand.

### ADR-03: Firebase Cloud Functions v2 vs. Dedicated Containerized Server (Express/Docker)
- **Decision:** **Adopt Firebase Cloud Functions v2 (Cloud Run backend); reject long-running Docker VPS.**
- **Rationale:** Serverless concurrency up to 80 requests/instance, colocation with Firestore in `asia-south1`, and zero infrastructure maintenance.

### ADR-04: Tailwind CSS vs. Heavy UI Component Libraries (MUI / Ant Design)
- **Decision:** **Adopt Tailwind CSS with custom enterprise design tokens; reject MUI and Ant Design.**
- **Rationale:** Clean, high-density data layouts, no runtime CSS-in-JS overhead, and easy RTL/multilingual scaling.

### ADR-05: React Hook Form + Zod vs. Formik + Yup
- **Decision:** **Adopt React Hook Form with Zod schema resolvers.**
- **Rationale:** Uncontrolled inputs eliminate keystroke lag; Zod types are shared seamlessly across frontend and backend.

### ADR-06: i18next vs. Custom Dictionary System
- **Decision:** **Adopt i18next for enterprise localization.**
- **Rationale:** First-class support for English, Tamil, and Hindi with pluralization and locale formatting.

### ADR-07: Deferral of Automated Payment Gateway Integration
- **Decision:** **Implement abstract Payment Provider interface; defer third-party gateway SDK integration to a post-core phase.**
- **Rationale:** Core retail operations focus on transactional reliability; manual tender confirmation suffices for Phase 1-5.

---

## 3. Local Development Tooling & Configuration

- **Firebase Emulators:**
  - Auth: `127.0.0.1:9099`
  - Firestore: `127.0.0.1:8080`
  - Functions: `127.0.0.1:5001`
  - Storage: `127.0.0.1:9199`
  - Emulator UI: `127.0.0.1:4000`
- **Environment Detection:** The frontend automatically checks `VITE_USE_FIREBASE_EMULATORS=true` and connects to local emulator endpoints, eliminating any risk of production database leakage during development.
