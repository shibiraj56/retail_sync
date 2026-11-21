# Retail Sync — Phase 2 Progress Tracker
**Master Data Management (PIM)**

> **Project Target:** Friday, November 27, 2026 Handover  
> **Current Date:** Saturday, November 21, 2026  
> **Status:** Day 2 Completed & Audited — Awaiting Approval for Day 3

---

## 1. Schedule & Milestone Progress

| Stage | Scope / Deliverables | Planned Date | Status | Verification Summary |
| :--- | :--- | :--- | :---: | :--- |
| **Day 1** | Architecture Baseline & Verification | Nov 20 | **COMPLETE** | Workspace audited, 11 corrections verified, baseline build passing. |
| **Day 2** | Categories, Brands & Units of Measure (UoM) | Nov 21 | **COMPLETE** | Cloud Functions v2, codeRegistry uniqueness, 2-level hierarchy, 7 standard UoMs, UI screens, 14 rules tests, 38 unit tests. |
| **Day 3** | Product Master Core (CRUD & Lifecycle) | Nov 22 | *Pending Approval* | Product schema, category/brand/UoM binding, product codes, archival. |
| **Day 4** | Matrix Variants & Identifier Registries | Nov 23 | *Upcoming* | Size x Color x Style matrix, deterministic IDs, SKU/barcode registries. |
| **Day 5** | Pricing Hierarchy & Tax Configuration | Nov 24 | *Upcoming* | Integer minor units, GST slabs, HSN/SAC, currency configuration. |
| **Day 6** | Supplier & Customer Master Directories | Nov 25 | *Upcoming* | Supplier profiles, cashier customer allowlist, duplicate phone search. |
| **Day 7** | E2E Integration, Emulators & Hardening | Nov 26 | *Upcoming* | Full multi-vertical test suite, performance audit, defect resolution. |
| **Day 8** | Handover, Demo Walkthrough & Sign-Off | Nov 27 | *Upcoming* | Handover report, demonstration across 6 verticals, final sign-off. |

---

## 2. Day 2 Completed Deliverables (November 21, 2026)

### 2.1 Backend Cloud Functions (Firebase Functions v2)
- **`upsertCategory`**: Validates input schema, enforces strict 2-level hierarchy (Root $\rightarrow$ Subcategory), prevents circular references, and guarantees organization-wide code uniqueness via `/codeRegistry/CATEGORY_{CODE}` inside `runTransaction`.
- **`archiveCategory`**: Soft-archives categories (`status: "ARCHIVED"`) and verifies zero active subcategories before archival.
- **`upsertBrand`**: Validates brand metadata, manufacturer details, logo URL, and guarantees organization-wide code uniqueness via `/codeRegistry/BRAND_{CODE}` inside `runTransaction`.
- **`archiveBrand`**: Soft-archives brands and marks code registry as `RESERVED_ARCHIVED`.
- **`upsertUnitOfMeasure`**: Validates custom units of measure, enforces integer vs. fractional precision constraints, and prevents cross-dimensional conversion conflicts.
- **`seedDefaultUnitsOfMeasure`**: Seeds the 7 standard retail units: `PCS`, `KG`, `GM`, `MTR`, `LTR`, `BOX`, `SET`.
- **`archiveUnitOfMeasure`**: Soft-archives custom units while protecting system default units from deletion.

### 2.2 Security Rules Hardening (`firestore.rules`)
- **Direct Catalog Writes Blocked**: `/categories/{id}`, `/brands/{id}`, `/unitsOfMeasure/{id}`, `/products/{id}`, and all registries enforce `allow write: if false;` to guarantee mutations route through Cloud Functions.
- **Customer Cashier Allowlist (Safeguard #1)**: Explicitly validated `isCashier(orgId)` role, restricted creation to `B2C_RETAIL` with `ACTIVE` status and zero B2B/credit fields, restricted updates to whitelisted contact/address fields, and unconditionally blocked direct deletion.

### 2.3 Frontend UI Modules
- **`CategoryListPage.tsx`**: 2-level hierarchical view grouping subcategories under roots, search by name/code, status badges, Add/Edit modal with HSN/tax rate defaults.
- **`BrandListPage.tsx`**: High-density grid with logo preview, manufacturer info, support email/phone, Add/Edit modal.
- **`UomListPage.tsx`**: Standard units table, fractional precision indicator, "Seed Standard Units" button, and custom unit creation modal.
- **Navigation**: Integrated into `Sidebar.tsx` under "Master Data (PIM)" and lazy-loaded in `App.tsx`.

---

## 3. Test & Build Execution Metrics

| Test / Build Suite | Executed Command | Passed | Failed | Total | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Vitest Unit Tests** | `pnpm vitest run tests/unit` | **38** | 0 | 38 | **100% PASS** |
| **Security Rules Tests** | `pnpm vitest run tests/rules` | **14** | 0 | 14 | **100% PASS** |
| **Frontend TypeScript** | `pnpm exec tsc --noEmit` | 0 errors | 0 | - | **PASS** |
| **Frontend Vite Build** | `pnpm build` | `dist/` built (14.99s) | 0 | - | **PASS** |
| **Backend Functions Build**| `cd functions; pnpm build` | `functions/lib` compiled | 0 | - | **PASS** |

---

## 4. Remaining Tasks for Day 3 (Product Master Core)
1. Product document schema and Zod validation (`ProductInputSchema`, `ProductDocument`).
2. Category, Brand, and UoM foreign key validation inside `upsertMasterProduct`.
3. Organization-wide product code uniqueness via `/codeRegistry/PRODUCT_{CODE}`.
4. Product lifecycle management (`ACTIVE`, `INACTIVE`, `ARCHIVED`).
5. ProductListPage with category/brand filtering and ProductCreate wizard.
