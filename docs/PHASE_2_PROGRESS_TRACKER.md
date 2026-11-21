# Retail Sync — Phase 2 Progress Tracker
**Master Data Management (PIM)**

> **Project Target:** Friday, November 27, 2026 Handover  
> **Current Date:** Sunday, November 22, 2026  
> **Status:** Day 3 Product Master Core Completed & Audited — Awaiting Approval for Day 4

---

## 1. Schedule & Milestone Progress

| Stage | Scope / Deliverables | Planned Date | Status | Verification Summary |
| :--- | :--- | :--- | :---: | :--- |
| **Day 1** | Architecture Baseline & Verification | Nov 20 | **COMPLETE** | Workspace audited, 11 corrections verified, baseline build passing. |
| **Day 2** | Categories, Brands & Units of Measure (UoM) | Nov 21 | **COMPLETE** | Cloud Functions v2, codeRegistry uniqueness, 2-level hierarchy, 7 standard UoMs, UI screens, 14 rules tests, 38 unit tests. |
| **Day 3** | Product Master Core (CRUD & Lifecycle) | Nov 22 | **COMPLETE** | Preflight fixes, product schema, codeRegistry PRODUCT_{CODE}, UoM compatibility, snapshots, storage rules, 3 UI screens, 46 unit tests, 15 rules tests. |
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

## 3. Day 3 Completed Deliverables (November 22, 2026)

### 3.1 Stage 1 Preflight Verification & Corrections
- **Organization Identifier Standardization**: Standardized `organizationId` across all data schemas and documents (`src/types/catalog.ts`, `functions/src/schemas/catalog.ts`), and `orgId` across route/rules paths.
- **Reference Archival Protection**: Updated `archiveCategory`, `archiveBrand`, and `archiveUnitOfMeasure` to query `/products` where `status in ['ACTIVE', 'INACTIVE']`; throws descriptive `ValidationError` to prevent breaking active product references.
- **Identifier Transition Policy**: When category or brand codes are updated, the previous code registry entry is preserved as `status: 'RESERVED_ARCHIVED'` and linked via `supersededBy`, preventing identifier collision or historical reference invalidation.

### 3.2 Backend Cloud Functions (Firebase Functions v2)
- **`upsertMasterProduct`**: Enforces `runTransaction` with strict reads-before-writes sequencing, validates alphanumeric code uniqueness via `/codeRegistry/PRODUCT_{CODE}`, verifies active status of category, brand, base UoM, and secondary UoM, validates dimensional compatibility and positive conversion factor ($1 \text{ Sec} = \text{factor} \times \text{Base}$), and stores immutable snapshots of referenced entities.
- **`archiveProduct`**: Soft-archives master product (`status: 'ARCHIVED'`), preserves code in registry as `RESERVED_ARCHIVED`, and cascades archival down to child variants.
- **`setProductStatus`**: Authoritative lifecycle toggle between `ACTIVE` and `INACTIVE` (rejects status modifications on archived products).

### 3.3 Storage Security & Media Rules
- **`storage.rules`**: Hardened to enforce `< 5MB` size limit, `image/*` MIME type assertion, and tenant authentication scoping for all product images at `organizations/{orgId}/products/{productId}/{filename}`.
- **`uploadProductImage`**: Client-side storage service uploading to Firebase Storage with metadata and download URL retrieval.

### 3.4 Frontend UI Screens
- **`ProductListPage.tsx`**: Catalog table with image thumbnails, classification tags, base & packaging UoMs, HSN & GST slab indicators, tracking flags, text search, multi-dropdown filtering (Category, Brand, Status), and status toggle/archive modals.
- **`ProductCreateWizard.tsx`**: 5-step structured wizard covering Identity, Classification, Units & Packaging, Tax Compliance, and Media/Tracking with image upload & primary selection.
- **`ProductDetailsPage.tsx`**: Full 360° product profile with image gallery, classification snapshot, UoM conversion ratio breakdown, tax & MRP pricing policies, and traceability tracking badges.
- **Navigation & Routing**: Mounted lazy-loaded routes in `App.tsx` and sidebar link in `Sidebar.tsx`.

---

## 4. Test & Build Execution Metrics

| Test / Build Suite | Executed Command | Passed | Failed | Total | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Vitest Unit Tests** | `pnpm vitest run tests/unit` | **46** | 0 | 46 | **100% PASS** |
| **Security Rules Tests** | `pnpm vitest run tests/rules` | **15** | 0 | 15 | **100% PASS** |
| **Frontend TypeScript** | `pnpm exec tsc --noEmit` | 0 errors | 0 | - | **PASS** |
| **Frontend Vite Build** | `pnpm build` | `dist/` built (29.63s) | 0 | - | **PASS** |
| **Backend Functions Build**| `cd functions; pnpm build` | `functions/lib` compiled | 0 | - | **PASS** |

---

## 5. Scope Boundaries Maintained (Deferred to Authorized Days)
- **Matrix Variants & SKU Generation**: Deferred to Day 4.
- **Barcode Registry Management**: Deferred to Day 4.
- **Pricing Tiers & Minor-Unit Math**: Deferred to Day 5.
- **Supplier & Customer Master**: Deferred to Day 6.
- **Inventory Balances & POS Sales**: Phase 3 / Phase 4 (Strictly Out of Scope).
