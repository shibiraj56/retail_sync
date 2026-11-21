# Retail Sync — Product Variant Matrix & Identifier Registries Architecture

> **Document Status:** Authoritative (Phase 2 — Day 4 Architecture & Implementation)  
> **Target Audience:** System Architects, Backend Engineers, Frontend Engineers, QA Engineers  
> **Last Updated:** 2026-11-21  

---

## 1. Executive Summary

Day 4 of Phase 2 (Master Data Management) establishes the **Product Variant Engine** and **Organization-Wide Identifier Registries (SKU and Barcode)**.

The system serves multi-vertical retail requirements—including grocery, garments/textiles, hardware, electricals, and general retail—within a unified, configurable architecture.

Key architectural pillars:
1. **Configurable 1-to-3 Axis Variant Matrix:** Generates Cartesian product combinations without duplication.
2. **Deterministic Variant Identifiers:** Derives immutable variant IDs using canonical attribute normalization and cryptographic hashing, ensuring stable identity across matrix regenerations without reliance on array order or random keys.
3. **Server-Authoritative Identifier Registries:** Enforces organization-wide uniqueness for SKUs and Barcodes via transactional reservations and prevents reassignment of retired or archived identifiers.
4. **Cross-Format Global Barcode Uniqueness:** Unifies EAN-13, UPC-A, Code-128, and custom internal formats into a single uniqueness namespace per organization.
5. **Bounded Transaction Budgeting & Staged Background Jobs:** Differentiates small matrix operations (<= 50 variants in a single atomic transaction) from large matrices (up to 500 variants) orchestrated via chunked background jobs equipped with worker leases and monotonically increasing fencing tokens.

---

## 2. Variant Data Model & Storage Hierarchy

Variants reside in a scoped subcollection beneath their parent master product:

```
/organizations/{orgId}/products/{productId}/variants/{variantId}
```

### Document Schema: `ProductVariantDocument`

```typescript
interface ProductVariantDocument {
  id: string; // Deterministic format: `var_${hash.slice(0, 16)}`
  productId: string; // Foreign key to parent product
  organizationId: string; // Tenant root identifier
  sku: string; // Primary SKU, normalized uppercase (e.g. "SHIRT-M-NAVY")
  barcode: string; // Primary barcode (EAN-13, UPC-A, Code-128, or Custom)
  additionalBarcodes?: string[]; // Up to 5 alternate barcodes (e.g., supplier barcodes, pack barcodes)
  attributeValues: Record<string, string>; // e.g. { "Size": "M", "Color": "Navy Blue" }
  pricing: {
    mrp: number; // Maximum Retail Price in minor units (paise)
    sellingPrice: number; // Base selling price in minor units
    costPrice: number; // Base purchase cost in minor units
    wholesalePrice?: number; // Optional wholesale tier in minor units
    minimumSellingPrice?: number; // Price floor in minor units
  };
  taxRatePercent: number; // Inherited or variant-specific GST slab percentage
  trackInventory: boolean; // Flag enabling inventory ledger tracking
  reorderPoint: number; // Minimum balance trigger
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}
```

---

## 3. Deterministic Variant ID Generation Algorithm

To preserve variant identity when matrices are refreshed or recalculated, variant IDs are calculated deterministically from the parent product ID and normalized attribute key-value pairs:

### Normalization and Hashing Steps

1. **Key Normalization:** Trim and convert all attribute keys to lowercase (`"Size "` -> `"size"`).
2. **Value Normalization:** Trim whitespace from all attribute values (`" Navy Blue "` -> `"Navy Blue"`).
3. **Lexicographical Key Sorting:** Sort attribute pairs alphabetically by normalized key name (`['color', 'size', 'style']`).
4. **Canonical Serialization:** Construct a delimiter-separated string:  
   `canonicalAttributes = sortedKeys.map(k => `${k}=${attributes[k]}`).join(';')`
5. **Input Framing:** `rawInput = `${productId}::${canonicalAttributes}``
6. **Cryptographic Hash:** Compute SHA-256 digest over `rawInput`.
7. **Variant ID:** `var_${hash.slice(0, 16)}`

### Guarantees
- **Permutation Invariance:** `{ Size: 'M', Color: 'Red' }` and `{ Color: 'Red', Size: 'M' }` yield identical IDs.
- **Cross-Product Collision Free:** Combining `productId` into the hash ensures identical attribute combinations on different products never share an ID.
- **Matrix Regeneration Safety:** Regenerating an existing matrix yields identical IDs, preventing duplicate variant documents and preserving existing prices and inventory balances.

---

## 4. SKU Registry & Lifecycle Policy

SKUs are registered in an organization-level collection:
`/organizations/{orgId}/skuRegistry/{normalizedSku}`

### SKU Registry Document Schema

```typescript
interface SkuRegistryDocument {
  id: string; // Matches normalized uppercase SKU
  organizationId: string;
  sku: string;
  targetProductId: string;
  targetVariantId: string;
  status: "ACTIVE" | "RESERVED_ARCHIVED";
  supersededBy?: string; // If replaced, references the new SKU
  retiredAt?: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}
```

### Uniqueness & Replacement Rules
1. **Case-Insensitive Upper Normalization:** All SKUs are trimmed and converted to uppercase. Permitted characters: `A-Z`, `0-9`, `-`, `_`, `.`, `/`.
2. **Single Tenant Isolation:** SKUs must be unique within an organization.
3. **Atomic Reservation:** Claimed during the Firestore transaction write phase after verifying non-existence in the read phase.
4. **Replacement & Retirement Policy:**
   - When a variant's SKU is modified from `OLD_SKU` to `NEW_SKU`, `OLD_SKU` is transitioned to `status: 'RESERVED_ARCHIVED'`, `supersededBy: NEW_SKU`, and `retiredAt: now`.
   - `NEW_SKU` is registered with `status: 'ACTIVE'`.
   - Both mutations occur within the same atomic transaction.
   - **No Reuse:** A SKU in `RESERVED_ARCHIVED` status can **never** be claimed by any other product or variant.

---

## 5. Barcode Registry & Validation Rules

Barcodes are registered in an organization-level collection:
`/organizations/{orgId}/barcodeRegistry/{normalizedBarcode}`

### Supported Formats & Validation Algorithms

1. **EAN-13 (13 Digits):**
   - Must be exactly 13 numeric digits.
   - Modulo 10 check digit: Multiply odd positions (1-indexed) by 1, even positions by 3. Check digit = `(10 - (sum % 10)) % 10`.
2. **UPC-A (12 Digits):**
   - Must be exactly 12 numeric digits.
   - Modulo 10 check digit: Multiply odd positions (1-indexed) by 3, even positions by 1. Check digit = `(10 - (sum % 10)) % 10`.
3. **Code-128:**
   - 1 to 80 characters of printable ASCII (ASCII 32 to 126).
4. **Custom Alphanumeric:**
   - 2 to 50 uppercase alphanumeric characters, underscores, or hyphens (`^[A-Z0-9_-]{2,50}$`).

### Global Barcode Uniqueness Policy
- **Cross-Format Namespace:** All barcode formats (EAN-13, UPC-A, Code-128, Custom) share the **same global namespace** per organization.
- **Multiple Barcodes Per Variant:** A variant may possess 1 primary barcode and up to 5 additional barcodes (total 6). Each barcode must be distinct within the variant and across the entire organization.
- **Permanent Archival:** Barcodes attached to archived variants transition to `status: 'RESERVED_ARCHIVED'` and are permanently retired.

---

## 6. Firestore Transaction Budgeting & Staged Background Jobs

### Transaction Operation Envelope Calculation
- **Firestore Hard Limit:** 500 document writes per transaction.
- **Writes Per Variant:**
  - 1 variant document
  - 1 SKU registry document
  - 1 Barcode registry document (plus any additional barcodes)
- **Base Overhead:**
  - 1 parent product document update (`hasVariants: true`, `updatedAt`)
  - 1 audit / job record
- **Operations for 50 Variants:** `50 * 3 + 2 = 152 writes`. This leaves a 348-operation buffer below the 500 write limit, preventing contention aborts.

### Dual Execution Strategy

| Parameter | Small Matrix (<= 50 Variants) | Large Matrix (> 50 Variants, up to 500) |
| :--- | :--- | :--- |
| **Execution Path** | Synchronous Callable Function (`saveProductVariantsSync`) | Staged Background Job (`createVariantMatrixJob`) |
| **Transaction Boundary** | 1 Atomic Firestore Transaction | Multiple Sequential Chunk Transactions |
| **Chunk Size** | All items (<= 50) | 25 variants per chunk (~77 writes) |
| **Resumability** | None (atomic rollback on failure) | Checkpointed; resumes from `currentChunkIndex` |
| **Worker Protection** | N/A | Monotonically increasing fencing tokens & 60s leases |

### Large Matrix Worker Fencing & Recovery Protocol

```
/organizations/{orgId}/variantJobs/{jobId}
```

```typescript
interface VariantMatrixJobDocument {
  id: string;
  organizationId: string;
  productId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "PARTIALLY_FAILED" | "FAILED";
  totalCombinations: number;
  processedCount: number;
  failedCount: number;
  currentChunkIndex: number;
  totalChunks: number;
  chunkSize: number; // 25
  fencingToken: number; // Monotonic version counter
  leaseWorkerId: string | null;
  leaseExpiresAt: FirebaseFirestore.Timestamp | null;
  errors: Array<{ variantIndex: number; sku?: string; reason: string }>;
  plannedVariants: UpsertVariantItem[];
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}
```

1. **Lease Acquisition:** A worker calls `acquireJobLease`. If the lease is expired or unassigned, `fencingToken` is incremented (`token + 1`), `leaseWorkerId` is bound, and `leaseExpiresAt` is set to `now + 60s`.
2. **Chunk Execution & Stale Worker Fencing:** `processVariantMatrixJobChunk` checks `job.fencingToken == expectedToken`. If another worker acquired a lease in the interim, the stale worker's transaction is aborted.
3. **Checkpointing:** Upon committing a chunk of 25 variants, `currentChunkIndex` is advanced and `processedCount` updated. Successfully committed chunks are persistent and never repeated upon retry.

---

## 7. Role-Based Access Control (RBAC) Matrix

| Operation | OWNER | MANAGER | INVENTORY_MANAGER | CASHIER | ACCOUNTANT | Direct Client SDK |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Read Variants** | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed (via Rules) |
| **Generate Matrix Preview** | Allowed | Allowed | Allowed | Denied | Denied | Denied |
| **Save Variants (Sync)** | Allowed | Allowed | Allowed | Denied | Denied | Denied |
| **Upsert Single Variant** | Allowed | Allowed | Allowed | Denied | Denied | Denied |
| **Archive Variant** | Allowed | Allowed | Allowed | Denied | Denied | Denied |
| **Create/Process Matrix Job** | Allowed | Allowed | Allowed | Denied | Denied | Denied |
| **Direct Client Write to Registries** | Denied | Denied | Denied | Denied | Denied | **DENIED (Rules)** |

---

## 8. Known Limitations & Phase 3 Boundaries

1. **No Inventory Balances in Day 4:** Inventory on-hand balances, store-level allocation, stock adjustments, and batch/serial instances remain strictly scoped to Day 5 and Phase 3.
2. **Matrix Combinations Ceiling:** Matrices up to 500 variants are supported via 20 chunks of 25 items. Matrices requiring > 500 combinations should be split into discrete product lines.
3. **Client Direct Write Lockdown:** All variant and registry modifications require Cloud Functions v2 invocations with authoritative Firestore active membership verification.
