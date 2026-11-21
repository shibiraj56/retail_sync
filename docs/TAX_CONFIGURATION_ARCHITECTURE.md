# Retail Sync — Tax Configuration & GST Engine Architecture

> **Document Version:** 1.0.0  
> **Milestone:** Phase 2, Day 5  
> **Status:** Implementation Complete & Validated  
> **Compliance:** Indian GST Law (CGST, SGST, IGST, UTGST) & Multi-Jurisdiction Ready

---

## 1. Executive Summary

Retail Sync's Tax Engine provides a pure, deterministic, integer-arithmetic tax computation and classification engine tailored for Indian retail compliance under the Goods and Services Tax (GST) Act, 2017, while supporting extensible international VAT models.

The module supports standard GST slabs (Exempt, 0.25%, 3%, 5%, 12%, 18%, 28%), statutory trade discount deductions prior to tax valuation (Section 15, CGST Act), and automated intra-state vs. inter-state tax split routing with odd-paise component balancing.

---

## 2. Standard Indian GST Slabs

Retail Sync organizations seed the standard Indian GST classification slabs:

| Slab Code | Rate (%) | Description | Typical Products |
| :--- | :---: | :--- | :--- |
| `GST_EXEMPT` | **0%** | Nil / Exempt | Fresh vegetables, unpackaged food grains, milk, salt. |
| `GST_0_25` | **0.25%** | Special Low | Rough diamonds, unworked precious stones. |
| `GST_3` | **3%** | Jewellery & Bullion | Gold, silver, platinum jewellery, worked precious stones. |
| `GST_5` | **5%** | Essential Consumer Goods | Branded food grains, edible oil, tea, coffee, footwear $\le ₹1,000$. |
| `GST_12` | **12%** | Standard Lower Rate | Processed foods, apparel $> ₹1,000$, dairy products, hardware tools. |
| `GST_18` | **18%** | Standard General Rate | Consumer electronics, FMCG, soaps, hardware supplies, services. |
| `GST_28` | **28%** | Luxury & Demerit Goods | Air conditioners, automobiles, tobacco, luxury items. |

---

## 3. GST Calculation Logic & Formulas

### 3.1 Intra-State vs. Inter-State Routing
- **Intra-State Transaction**: Origin State Code $\equiv$ Destination State Code (e.g., Maharashtra `27` $\rightarrow$ `27`).
  - Total tax is split equally into **CGST (50%)** and **State/UT GST (SGST 50%)**.
- **Inter-State Transaction**: Origin State Code $\ne$ Destination State Code (e.g., Maharashtra `27` $\rightarrow$ Karnataka `29`).
  - Total tax is allocated as **Integrated GST (IGST 100%)**.

### 3.2 Tax-Exclusive Pricing Formula (B2B / Plus-Tax)
Where base amount is net taxable:
$$\text{TaxableBase} = \max(0, \text{GrossAmount} - \text{Discount})$$
$$\text{TotalTax} = \text{round}\left( \frac{\text{TaxableBase} \times \text{RateBps}}{10000} \right)$$
$$\text{FinalPayable} = \text{TaxableBase} + \text{TotalTax}$$

### 3.3 Tax-Inclusive Pricing Formula (B2C / MRP Back-Calculation)
Where price includes tax (e.g., Maximum Retail Price):
$$\text{NetGross} = \max(0, \text{GrossAmount} - \text{Discount})$$
$$\text{TaxableBase} = \text{round}\left( \frac{\text{NetGross} \times 10000}{10000 + \text{RateBps}} \right)$$
$$\text{TotalTax} = \text{NetGross} - \text{TaxableBase}$$
$$\text{FinalPayable} = \text{NetGross}$$

*(Note: $\text{RateBps} = \text{TaxRatePercent} \times 100$, e.g. $18\% \rightarrow 1800$ basis points).*

---

## 4. Odd-Paise Split Balancing Algorithm

Under Indian GST accounting, splitting an odd tax amount (e.g., 15 paise at 15%) in integer division yields a half-paisa ($7.5\text{p}$). To prevent a $1\text{p}$ rounding mismatch across state and central ledgers, the engine uses **deterministic component balancing**:

$$\text{CGST} = \left\lfloor \frac{\text{TotalTax}}{2} \right\rfloor$$
$$\text{SGST} = \text{TotalTax} - \text{CGST}$$

**Proof of Invariant**:
$$\text{CGST} + \text{SGST} = \left\lfloor \frac{\text{TotalTax}}{2} \right\rfloor + \left( \text{TotalTax} - \left\lfloor \frac{\text{TotalTax}}{2} \right\rfloor \right) \equiv \text{TotalTax}$$

No paisa is ever created or dropped.

---

## 5. Security & Access Control

1. **Direct Writes Denied**: Direct client writes to `/organizations/{orgId}/taxConfigurations/{id}` are strictly forbidden (`allow write: if false;`).
2. **Callable Cloud Functions v2**:
   - `upsertTaxConfiguration`: Requires `OWNER` or `MANAGER` role.
   - `seedDefaultTaxConfigurations`: Seeds standard 7 GST slabs.
   - `archiveTaxConfiguration`: Protects active tax slabs referenced by live products.
3. **Tenant Read Isolation**: Read operations are restricted to verified active organization members (`hasActiveMembership(orgId)`).
