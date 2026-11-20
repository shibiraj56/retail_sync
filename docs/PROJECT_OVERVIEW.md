# Retail Sync — Project Overview

> **Document Status:** Complete & Authoritative (Phase 0 — Final Sign-Off)  
> **Target Audience:** Engineering, Product, DevOps, Stakeholders  
> **Last Updated:** 2026-11-20  

---

## 1. Executive Summary & Product Vision

**Retail Sync** is a modern, cloud-native, multi-tenant Retail Management Platform and Enterprise Resource Planning (ERP) suite engineered specifically for small, medium, and growing retail businesses.

Historically, traditional retail software in these segments suffers from deep architectural fragmentation:
- Fragile desktop-bound POS systems with high risk of single-point hardware failure, corrupted local databases, and data loss.
- Heavyweight enterprise ERPs (e.g., SAP, Dynamics, NetSuite) that are financially prohibitive, over-engineered, and too complex for regional retail workflows.
- Lightweight generic POS apps that fail to handle matrix variants (apparel), dual units of measurement (hardware), serial/IMEI tracking (electronics), or batch expiry (groceries).

**Retail Sync solves this by providing a unified, multi-tenant cloud platform with a modular core and industry-specific configuration profiles.** A single unified codebase powers the platform while dynamically adapting to the operational nuances of distinct retail categories through data-driven operational profiles.

---

## 2. Business Objectives

1. **Enterprise Reliability & Tested Latency:** Architected for responsive POS operations under real-world connectivity conditions, with performance validated through automated load testing rather than unverified latency assumptions.
2. **True Multi-Store Orchestration:** Empower retail businesses to effortlessly manage one or dozens of physical outlets with centralized catalog management, decentralized store stock holding, inter-store transfers, and consolidated financial reporting.
3. **Multi-Vertical Flexibility Without Code Bifurcation:** Allow grocery shops, garment boutiques, hardware stores, electrical distributors, and general retail to run on the exact same engine through pluggable business configurations.
4. **Zero-Trust Operational Security:** Ensure financial immutability, server-enforced pricing, tamper-evident transactional invoice numbering, and multi-tenant cryptographic and database isolation. Authoritative user permissions are strictly verified against server-side database records.
5. **Localization & Extensible Tax Structure:** Built from day one with multilingual UI support (English, Tamil, Hindi) and an India-first, GST-ready tax architecture that is structurally extensible for future tax regimes without claiming unverified statutory compliance certifications.
6. **Configurable Fiscal Calendar & Held Bill Policies:** Adaptable to regional operating norms by supporting both the Indian Financial Year (April 1 to March 31) and calendar year cycles (January 1 to December 31), alongside configurable held-bill expiration windows (1 to 72 hours).

---

## 3. Target Industry Verticals & Configurable Profiles

Rather than deploying disparate applications, Retail Sync implements an **Industry Profile Engine**. An Organization selects an industry profile during onboarding (or enables custom flags), which activates specific data models, input schemas, validation rules, and UI components.

| Industry Vertical | Unique Operational Demands | Retail Sync Architectural Solution |
| :--- | :--- | :--- |
| **1. Grocery & Provision Stores** | Fast barcode scanning, loose items sold by decimal weight/volume, batch numbers, manufacturing/expiry date tracking, near-expiry alerts. | Decimal quantity support, Batch & Expiry tracking engine, direct barcode-weighing scale integration protocols. |
| **2. Textile & Garment Shops** | Matrix variants (Color × Size × Style), unique barcode tag generation per variant, seasonal collections, non-financial exchange workflows. | 2D/3D Matrix Variant Generator, thermal barcode sticker generator, dedicated exchange voucher and credit note engine. |
| **3. Hardware Stores** | Dual Units of Measurement (e.g., sold by meter, kg, or piece; cut-pipe fractions), contractor credit ledgers (*Khata*), heavy bulk item handling. | Base/Secondary UoM with fixed or variable conversion factors, Customer Credit Ledger (*Khata*) with credit limits and aging balances. |
| **4. Electrical Shops** | Serial number and IMEI tracking, brand warranty registration, technician/electrician commission tracking, warranty lookup. | Serialized Inventory tracking (1 unit = 1 unique serial ID), warranty card data capture at checkout, referral/commission ledger. |
| **5. Wholesale & Distribution** | Tiered pricing based on order volume (Slab pricing), credit periods (Net 15/30), route sales, box-to-piece breakdown, packing slips. | Volume-based pricing tier rules, B2B invoicing with GST/tax details, Purchase Orders (PO) to Goods Receipt Notes (GRN) workflow. |
| **6. General Retail Stores** | Standard retail workflows, fast over-the-counter sales, cash drawer reconciliations, simple promotional discounts. | Streamlined rapid POS layout, single-click payment methods, day-end cash drawer settlement (*Z-Report*). |

---

## 4. High-Level Modular Monolith Architecture

Retail Sync is architected as a **Multi-Tenant Modular Monolith**. All core business capabilities are encapsulated into isolated domain modules with strictly defined contracts:

```
+-----------------------------------------------------------------------------------+
|                                   RETAIL SYNC                                    |
|                             Modular Monolith Engine                               |
+-----------------------------------------------------------------------------------+
|  [ Identity & Access ]    [ Master Catalog ]     [ Inventory & Warehousing ]      |
|  - Orgs & Stores          - Matrix Variants      - Multi-Store Balances           |
|  - Authoritative Members  - Multi-UoM & Batches  - Audit Movements & Serials      |
+-----------------------------------------------------------------------------------+
|  [ POS & Checkout Engine ] [ Sales & Invoicing ]  [ Procurement & Vendors ]        |
|  - Idempotent API         - Store Invoice Seq    - Purchase Orders (PO)           |
|  - Atomic Stock Lock      - Immutable Records    - Goods Receipt Notes (GRN)      |
+-----------------------------------------------------------------------------------+
|  [ Customer & Khata CRM ] [ Cash & Financials ]  [ Audit, Reports & Analytics ]   |
|  - Customer Ledgers       - Cash Drawer Sessions - Append-only Audit Trail        |
|  - Loyalty & Discounts    - Reversals & Vouchers - Extensible Tax & BI Exports    |
+-----------------------------------------------------------------------------------+
```

### Module Descriptions

1. **Identity & Multi-Tenancy Module:** Manages Organization lifecycles, store provisioning, user profiles, and authoritative store memberships (`/userMemberships/{userId}_{orgId}`) with granular role-based permissions.
2. **Master Catalog & Product Information Management (PIM):** Handles categories, brands, master products, matrix variants (Size, Color, Material), barcodes, and Unit of Measurement (UoM) conversion trees.
3. **Inventory & Warehouse Management Module:** Maintains real-time physical and available stock per store, serialized item tables, batch expiry tracking, stock transfers between stores, and damage/shrinkage adjustments.
4. **Point of Sale (POS) & Checkout Engine:** Highly optimized terminal interface with barcode scanner support, cart calculations, held bills with application-level expiration enforcement, and trusted atomic checkout dispatch.
5. **Sales & Invoicing Module:** Issues store-specific sequential tax invoices per configured fiscal year, generates PDF/thermal print streams, tracks payment splits, and issues legal reversal credit notes linked to original invoices.
6. **Procurement & Vendor Management Module:** Tracks supplier records, purchase orders, goods receipts (GRN) with landed cost calculations, and supplier payment ledgers.
7. **Customer & Khata Ledger Module:** Stores customer profiles, addresses, historical purchase timelines, loyalty points, and credit debit/credit balances with payment reminder logging.
8. **Cash Drawer & Financials Module:** Tracks shift/cash drawer openings, cash floats, mid-day petty cash drops, and shift end-of-day reconciliations (X-Reads and Z-Reads).
9. **Audit, Security & Reporting Engine:** Logs immutable business audit events, computes real-time gross margin, inventory valuation (FIFO/Weighted Average), and exportable tax/audit summaries.
10. **Localization Module:** Provides complete interface translation in English, Tamil, and Hindi, along with regional currency formatting (₹ Lakh/Crore and standard decimal formats).

---

## 5. Non-Negotiable Architectural Principles

1. **Zero Client Trust:** The frontend is treated as an untrusted presentation surface. All pricing, tax calculations, discounts, inventory deductions, and sequential invoice assignments are executed and verified on the server against authoritative database records.
2. **Authoritative Membership Verification:** JWT custom claims are treated only as lightweight hints for client routing. Every privileged backend operation authoritatively validates the caller's active membership document in Firestore.
3. **Financial Immutability & Reversal Trail:** Once an invoice, payment record, or stock movement is committed, it can never be updated or deleted in place (`UPDATE` and `DELETE` operations are forbidden). Any correction requires an explicit compensatory reversal document (Credit Note / Reversal Movement) referencing the original invoice.
4. **Transactional Invoice Numbering & Fiscal Boundaries:** Invoice counters increment atomically per store and financial year inside the checkout transaction. Failed transactions abort cleanly and do not consume numbers; committed numbers are never reused. Changes to fiscal year cycles are locked once invoices exist. Unbroken numeric sequences cannot be guaranteed across all operational business cancellation scenarios.
5. **Mandatory Online Connection for Final Checkout:** To preserve global inventory integrity and transactional invoice uniqueness, an active internet connection is mandatory to finalize sales. Offline cart recovery and held bills are provided for transient interruptions (with application-level expiration validation), but offline financial transaction synchronization is explicitly excluded from the initial release.
6. **Payment Gateway Separation:** External payment provider calls are strictly isolated outside database transactions. Client-submitted UPI reference codes are treated as unverified manual tender notes until verified by a trusted backend gateway in a future phase.
