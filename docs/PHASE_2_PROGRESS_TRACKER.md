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
| **Day 4** | Matrix Variants & Identifier Registries | Nov 23 | **COMPLETE** | 1-3 axis matrix, deterministic variant IDs, SKU/barcode registries, cross-format barcode validation, bounded sync + staged background jobs, 75 unit tests. |
| **Day 5** | Pricing Hierarchy & Tax Configuration | Nov 24 | **COMPLETE** | Integer minor units (paise), 6-tier precedence, GST engine, intra/inter-state split, snapshots, Cloud Functions v2, 112 unit tests, 32 rules tests. |
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

## 4. Day 5 Completed Deliverables (November 24, 2026)

### 4.1 Money and Currency Architecture
- **Safe Integer Minor Units**: All monetary values represented in minor units (paise in INR, cents in USD), eliminating floating-point math inaccuracies.
- **Price Relationship Sanity**: Enforces $\text{costPrice} \le \text{sellingPrice} \le \text{mrp}$, $\text{minimumSellingPrice} \le \text{sellingPrice}$, and $\text{wholesalePrice} \le \text{mrp}$.
- **Banker's Half-Up Rounding**: Deterministic rounding utility for conversions and tax allocations.

### 4.2 Six-Tier Pricing Precedence Engine
- **Precedence Hierarchy**: Evaluates `CUSTOMER` $\rightarrow$ `CUSTOMER_GROUP` $\rightarrow$ `STORE` $\rightarrow$ `VARIANT` $\rightarrow$ `PRODUCT` $\rightarrow$ `ORGANIZATION`.
- **Date Interval Filtering**: Respects `effectiveStartDate` and `effectiveEndDate` windowing.
- **Role-Based Margin Redaction**: Strips `costPrice` when called by `CASHIER` to protect business margins.

### 4.3 Tax Configuration & GST Engine
- **Indian GST Slabs**: Seeded standard slabs (0%, 0.25%, 3%, 5%, 12%, 18%, 28%).
- **Intra/Inter-State Routing**: Automatically routes between CGST + SGST (intra-state) and IGST (inter-state).
- **Odd-Paise Balancing**: Balanced integer allocation prevents 1-paise tax discrepancy across ledger components.
- **Section 15 Discount Rule**: Deducts trade discounts prior to tax computation.
- **Frozen Snapshots**: Generates immutable `PriceAndTaxSnapshot` for downstream POS line items and invoices.

### 4.4 Cloud Functions v2 & Security Rules
- **Callable Endpoints**: `upsertTaxConfiguration`, `seedDefaultTaxConfigurations`, `archiveTaxConfiguration`, `upsertPricingRule`, `archivePricingRule`, `getEffectivePrice`, `calculateTaxEndpoint`, `updateVariantPricing`, `bulkUpdateVariantPricing`, `getPricingHistory`.
- **Firestore Security Rules**: Direct client writes denied (`allow write: if false;`), read access scoped to active tenant members (`hasActiveMembership(orgId)`).

### 4.5 Frontend Management Hub
- **`PricingManagementPage.tsx`**: Multi-tab interface mounted at `/catalog/pricing` with GST Tax Slabs, Store & Tier Pricing Rules, Bulk Price Updates, and GST Interactive Calculator.

---

## 5. Test & Build Execution Metrics

| Test / Build Suite | Executed Command | Passed | Failed | Total | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Vitest Unit Tests** | `pnpm vitest run tests/unit` | **112** | 0 | 112 | **100% PASS** |
| **Security Rules Tests** | `firebase emulators:exec ... "pnpm vitest run tests/rules"` | **32** | 0 | 32 | **100% PASS** |
| **Frontend TypeScript** | `pnpm exec tsc --noEmit` | 0 errors | 0 | - | **PASS** |
| **Frontend Vite Build** | `pnpm build` | `dist/` built (11.89s) | 0 | - | **PASS** |
| **Backend Functions Build**| `pnpm --prefix functions build` | `functions/lib` compiled | 0 | - | **PASS** |

---

## 6. Scope Boundaries Maintained (Deferred to Authorized Days)
- **Supplier & Customer Master**: Deferred to Day 6.
- **Inventory Balances & Stock Movements**: Phase 3 (Strictly Out of Scope).
- **POS Checkout & Invoicing**: Phase 4 (Strictly Out of Scope).
