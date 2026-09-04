# WarehouseOS — Master Data Specification

**For:** Claude Code, and anyone writing code against the master data
**Source file:** `WarehouseOS_MasterData.xlsx` (lives in Google Sheets)
**Last verified:** 31 August 2026 — 120 sites, 262 POC records

---

## 0. Read this first

This document is the contract for WarehouseOS master data. If code and this document disagree, this document is right.

**Three things that are easy to get wrong:**

1. **`Access_ID` is the primary key of POC_Master, not `POC_Email`.** One person can hold several rows — 24 people cover more than one site, one covers four. Never key on email.
2. **`Site_Code` and `Service_Codes` accept the literal string `ALL`.** That is how a nationwide admin is expressed. Code that assumes `Site_Code` is always a foreign key will break on every admin row.
3. **The backend is Google Sheets, not Excel.** Cross-sheet validation does not survive the xlsx import; dropdowns are applied by an Apps Script. Firestore migration is planned but unscheduled — keep persistence behind an interface.

---

## 1. File layout

Master data and transactional data live in **separate spreadsheets**. This is deliberate: Google caps a spreadsheet at ~10 million cells across all tabs, and service records grow without limit while masters do not.

```
WarehouseOS_MasterData              — this document describes this file
   ├── POC_Master          262 rows   who can log in, and what they see
   ├── Site_Master         120 rows   the warehouses
   ├── Service_Registry      6 rows   the services and how each behaves
   ├── Dropdowns            9 lists   allowed values (not data)
   ├── Master_Audit          empty    app-written change log
   └── Data_Issues         100 rows   known problems, not part of the schema

WarehouseOS_Diesel              — one file per service
   ├── Records                        one row per requisition
   └── Audit                          one row per action

WarehouseOS_<Service>  …             same two-tab shape
```

The app finds a service's file via `Service_Registry.AppScript_URL`. That is the only backend-aware value in the model — when Firestore lands, it becomes a collection name and nothing else changes.

---

## 2. POC_Master

Who can log in, and what they are allowed to see. A person absent from this tab cannot access the system even with a valid Workspace email.

| # | Column | Type | Req | Notes |
|---|---|---|---|---|
| A | `Access_ID` | string | Y | **PK.** `AC-0001`. Immutable. |
| B | `POC_Email` | string | Y | Google Workspace email. **Not unique** — one person may hold several rows. |
| C | `POC_Name` | string | Y | |
| D | `WH_Code` | string | Y | Human-readable warehouse name, denormalised from Site_Master for readability. **Display only — never join on it.** |
| E | `Role` | enum | Y | `SITE_POC` \| `WAREHOUSE_ADMIN` \| `SERVICE_ADMIN` \| `SUPER_ADMIN` |
| F | `Site_Code` | string | Y | FK -> `Site_Master.Site_Code`, **or the literal `ALL`** |
| G | `Service_Codes` | string | Y | FK -> `Service_Registry.Service_Code`, comma-separated, **or `ALL`** |
| H | `Contact_Number` | string | Y | Store as **text** — leading zeros and `+91` are lost as a number |
| I | `Is_Primary` | enum | Y | `Yes` \| `No`. See note below. |
| J | `Active` | enum | Y | `Yes` \| `No` |
| K | `Access_Start_Date` | date | Y | ISO `YYYY-MM-DD` |
| L | `Access_End_Date` | date | N | Blank = open-ended |
| M | `Description` | string | N | |
| N | `Reporting_Manager_Email` | string | N | 235 rows populated |
| O | `Last_Updated_By` | string | Y | App-written |
| P | `Last_Updated_At` | string | Y | App-written, ISO 8601 with offset, stored as text |

**On `Is_Primary`:** every site POC is a primary POC — there is no backup/primary distinction in this organisation. All `SITE_POC` rows are `Yes`. Admin rows are `No` because the field does not apply to them. **Do not build logic that assumes exactly one `Yes` per site** — a site can have up to 12 POCs, all primary.

---

## 3. Site_Master

One row per warehouse. Every site attribute lives here and nowhere else.

| # | Column | Type | Req | Notes |
|---|---|---|---|---|
| A | `Site_Code` | string | Y | **PK.** `ZHPL-{STATE}-{NN}`, e.g. `ZHPL-DEL-01`. **Immutable** — changing one orphans every historical record. |
| B | `WH_Code` | string | Y | Original warehouse name from the legacy sheet |
| C | `Facility_Name` | string | Y | |
| D | `SAP_Code` | string | N | B2C sites carry a real SAP code (`1510953B24`). B2B sites have none, so the WH name stands in. |
| E | `Cost_Center` | string | Y | **Always equal to `SAP_Code`.** Kept as its own column for finance-facing exports. |
| F | `Zone` | enum | Y | `North` \| `South` \| `East` \| `West` \| `Central` |
| G | `State` | enum | Y | 22 values |
| H | `City` | string | N | **Empty on all 120 rows** — not present in source data |
| I | `Address` | string | N | |
| J | `Pincode` | string | N | Store as **text** |
| K | `Channel` | enum | Y | `B2B` (68) \| `B2C` (52) \| `BOTH` (0 today) |
| L | `Entity` | string | Y | `Zomato Hyperpure Private Limited` — single value |
| M | `Business_Type` | enum | Y | `WHS` (52) \| `Grozo` (50) \| `HP` (14) \| `SS B2B` (4) |
| N | `GSTIN` | string | Y | Entity-and-state level, so duplicated across sites. Store as **text**. |
| O | `Lat_Long` | string | N | **Inconsistent formats** — decimal, DMS, and `Latitude: x, Longitude: y`. 51 blank. Parse defensively. |
| P | `Map_Link` | string | N | Sometimes a URL, sometimes a place name. Not reliably a link. |
| Q | `Services_Enabled` | string | Y | Comma-separated service codes, or `ALL`. **Drives the compliance denominator.** |
| R | `Go_Live_Date` | date | N | **Empty on all rows** — needs backfilling |
| S | `Closure_Date` | date | N | Blank while open |
| T | `Active` | enum | Y | `Yes` \| `No` |
| U-V | `Last_Updated_By` / `_At` | | Y | App-written |

**Site closure is a Site_Master operation.** Set `Active = No` and fill `Closure_Date`. Never delete the row, and never deactivate POCs one by one — access cascades from the site (§6).

---

## 4. Service_Registry

Configuration per service. Adding service #7 is a row here, not a code change.

| Column | Type | Notes |
|---|---|---|
| `Service_Code` | string | **PK.** Referenced by `POC_Master.Service_Codes` and `Site_Master.Services_Enabled`. Immutable. |
| `Service_Name` | string | Display name |
| `Needs_Approval` | enum | `Yes` — routes to an admin queue. `No` — saves immediately. **Only DIESEL is `Yes`.** |
| `Needs_Delivery_Validation` | enum | `Yes` — the received-vs-ordered step exists. **Only DIESEL.** |
| `Requires_Evidence` | enum | `Yes` — attachment mandatory before close |
| `Cadence` | enum | `DAILY` \| `WEEKLY` \| `MONTHLY` \| `EVENT_DRIVEN`. Defines the expected-submission count. |
| `Submission_Window` | string | `HH:MM`. Filed after this = late, not missing. |
| `SLA_Hours` | number | Hours to a decision before flagged overdue. Only meaningful when `Needs_Approval = Yes`. |
| `AppScript_URL` | string | Deployed Apps Script Web App URL for that service's data file |
| `Records_Tab` | string | Tab name for records, default `Records` |
| `Audit_Tab` | string | Tab name for the change log, default `Audit` |
| `Active` | enum | `No` hides the service without deleting its config |

### Current contents

| Service_Code | Needs_Approval | Needs_Delivery_Validation | Requires_Evidence | Cadence | Window | SLA |
|---|---|---|---|---|---|---|
| `DIESEL` | **Yes** | **Yes** | Yes | DAILY | 18:00 | 24 |
| `SITE_ACTIVITY` | No | No | No | DAILY | 11:00 | — |
| `ATTENDANCE` | No | No | No | DAILY | 11:00 | — |
| `EB_DG` | No | No | No | DAILY | 20:00 | — |
| `COLD_ROOM` | No | No | No | DAILY | 18:00 | — |
| `HOUSEKEEPING` | No | No | Yes | DAILY | 18:00 | — |

`AppScript_URL` is **empty for all six** — the per-service files have not been created yet.

---

## 5. Dropdowns

Not a data table. **Each column is an independent list of allowed values**, with the list name in row 1. Column lengths differ.

| List | Values |
|---|---|
| `Zone` | North, South, East, West, Central |
| `State` | 22 Indian states |
| `Entity` | Zomato Hyperpure Private Limited |
| `Business_Type` | WHS, Grozo, HP, SS B2B |
| `Channel` | B2B, B2C, BOTH |
| `Role` | SITE_POC, WAREHOUSE_ADMIN, SERVICE_ADMIN, SUPER_ADMIN |
| `Cadence` | DAILY, WEEKLY, MONTHLY, EVENT_DRIVEN |
| `Yes_No` | Yes, No |
| `Rejection_Reason` | Wrong quantity, Missing POD, Rate mismatch, Duplicate entry, Incomplete details, Other |

`Site_Code` and `Service_Code` are deliberately absent — those dropdowns read live from Site_Master and Service_Registry so new rows appear automatically.

**Validation is applied by Apps Script** (`apply-dropdowns.gs`), not by the xlsx. Google Sheets discards Excel's cross-sheet validation on import. The script prepends `ALL` to the Site_Code and Service_Codes lists.

---

## 6. Access control

**No permission is assigned directly. Every permission is computed.**

```
identity      = Google Workspace SSO email
row           = POC_Master where POC_Email = identity AND effective access (below)
role          = row.Role
site_scope    = row.Site_Code === 'ALL' ? <all active sites> : [row.Site_Code]
service_scope = row.Service_Codes === 'ALL'
                  ? <all active services>
                  : row.Service_Codes.split(',')
```

### Effective access

All four must hold, or the user is denied:

```
row.Active === 'Yes'
AND (Access_Start_Date is blank OR today >= Access_Start_Date)
AND (Access_End_Date  is blank OR today <= Access_End_Date)
AND (Site_Code === 'ALL' OR Site_Master[Site_Code].Active === 'Yes')
```

That last clause is the cascade: **deactivating a site revokes its POCs automatically.**

### Scope matrix

| Role | `Site_Code` | `Service_Codes` | Effective scope |
|---|---|---|---|
| `SITE_POC` | one code | usually `ALL` | Files data for one site, for services enabled at that site |
| `WAREHOUSE_ADMIN` | one code | `ALL` | Everything at one warehouse |
| `SERVICE_ADMIN` | `ALL` | **one code** | One service, every site — the nationwide approver |
| `SUPER_ADMIN` | `ALL` | `ALL` | Everything, plus master data |

A POC's effective services are `Service_Codes ∩ Site_Master.Services_Enabled`. A service not enabled at the site is not available even if the POC row says `ALL`.

### Enforcement

- **Filter server-side.** Client-side scope filtering is a UX affordance, never the control.
- **No self-approval.** The approving actor must differ from the submitting actor.
- A valid Workspace email with no POC_Master row is **denied**. Domain membership is authentication, not authorisation.

---

## 7. Diesel lifecycle

The only service with approval and validation. Reference pattern for future services.

```
DRAFT -> PENDING_ADMIN_APPROVAL -> APPROVED | REJECTED
                                     |
              type = Payment Only  -> PAYMENT_PROCESSING -> COMPLETED
              type = Delivery Only -> READY_FOR_DELIVERY -> validation
```

### Rules

- **Exactly two admin decisions:** approve or reject. No hold, no partial approval, no request-changes.
- **`rejectionReason` is mandatory on reject**, from the `Rejection_Reason` list.
- **A POC can never approve their own request.**
- A POC may delete **their own** requisition **only before approval**.
- **Every transition writes an audit row.** Nothing is silently deleted.

### Delivery validation — exact comparison, no tolerance

| Condition | Status |
|---|---|
| `received === ordered` | `Delivered` |
| `received < ordered` — **any amount, including 0.5 L** | `Partial Delivered` |
| `received === 0` | `Not Delivered` |

**There is no variance threshold.** The column was removed deliberately. Status is derived from the numbers and **cannot be manually overridden** by the POC.

> **Open:** `received > ordered` (over-delivery) has no defined status. Currently it would fall through to `Partial Delivered`, which is wrong. Decide before building the validation step.

---

## 8. TypeScript types

```ts
export type Role = 'SITE_POC' | 'WAREHOUSE_ADMIN' | 'SERVICE_ADMIN' | 'SUPER_ADMIN';
export type YesNo = 'Yes' | 'No';
export type Channel = 'B2B' | 'B2C' | 'BOTH';
export type Zone = 'North' | 'South' | 'East' | 'West' | 'Central';
export type BusinessType = 'WHS' | 'Grozo' | 'HP' | 'SS B2B';
export type Cadence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'EVENT_DRIVEN';

/** The literal 'ALL' marks a nationwide scope. Handle before treating as an FK. */
export const ALL = 'ALL' as const;
export type Scoped<T extends string> = T | typeof ALL;

export interface PocMaster {
  Access_ID: string;                 // PK
  POC_Email: string;                 // NOT unique
  POC_Name: string;
  WH_Code: string;                   // display only — never join on this
  Role: Role;
  Site_Code: Scoped<string>;
  Service_Codes: Scoped<string>;     // comma-separated when multiple
  Contact_Number: string;            // text, not number
  Is_Primary: YesNo;
  Active: YesNo;
  Access_Start_Date: string | '';    // YYYY-MM-DD
  Access_End_Date: string | '';
  Description: string;
  Reporting_Manager_Email: string;
  Last_Updated_By: string;
  Last_Updated_At: string;           // ISO 8601 with offset
}

export interface SiteMaster {
  Site_Code: string;                 // PK, immutable
  WH_Code: string;
  Facility_Name: string;
  SAP_Code: string;
  Cost_Center: string;               // always === SAP_Code
  Zone: Zone;
  State: string;
  City: string;                      // empty on all rows today
  Address: string;
  Pincode: string;                   // text
  Channel: Channel;
  Entity: string;
  Business_Type: BusinessType;
  GSTIN: string;
  Lat_Long: string;                  // inconsistent formats — parse defensively
  Map_Link: string;
  Services_Enabled: Scoped<string>;
  Go_Live_Date: string | '';         // empty on all rows today
  Closure_Date: string | '';
  Active: YesNo;
  Last_Updated_By: string;
  Last_Updated_At: string;
}

export interface ServiceRegistry {
  Service_Code: string;              // PK, immutable
  Service_Name: string;
  Needs_Approval: YesNo;
  Needs_Delivery_Validation: YesNo;
  Requires_Evidence: YesNo;
  Cadence: Cadence;
  Submission_Window: string;         // 'HH:MM'
  SLA_Hours: number | '';
  AppScript_URL: string;              // empty today
  Records_Tab: string;
  Audit_Tab: string;
  Active: YesNo;
  Last_Updated_By: string;
  Last_Updated_At: string;
}

export interface MasterAudit {
  Audit_ID: string;
  Timestamp: string;
  Actor_Email: string;
  Action: 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'REACTIVATE' | 'VALIDATION_FAIL';
  Target_Tab: 'POC_Master' | 'Site_Master' | 'Service_Registry';
  Target_Key: string;
  Field_Changed: string;
  Old_Value: string;
  New_Value: string;
  Source: 'APP' | 'SCRIPT' | 'MANUAL_EDIT';
  Notes: string;
}
```

---

## 9. Invariants

| # | Rule |
|---|---|
| I1 | **Never delete a row.** Deactivate with `Active = No` plus an end/closure date. A deleted row orphans every historical record referencing it. |
| I2 | **Never change a `Site_Code` or `Service_Code`** once records exist against it. |
| I3 | Every master change writes a `Master_Audit` row — one row per field changed. |
| I4 | Records tabs are **append-only**. State is derived from the latest event, never from an overwritten cell. |
| I5 | Look up columns **by header name, never by index.** An inserted column must fail loudly, not write quantity into the vendor field. |
| I6 | **No formulas storing data.** The app writes literal values only — a formula changes without an audit entry and will not survive the Firestore migration. |
| I7 | **Single writer.** Once the app writes to a sheet, humans get view-only. Concurrent human and machine writes interleave rows and corrupt state. |
| I8 | Persistence sits behind a repository interface. No product code references a spreadsheet ID, tab name, or cell address. |

---

## 10. Current data state

| Metric | Value |
|---|---|
| Sites | 120 (68 B2B, 52 B2C) |
| POC records | 262 |
| Distinct people | 141 |
| Sites with at least one POC | **106 of 120** |
| POCs per site | 1 to 12 |
| People covering multiple sites | 24 (one covers four) |
| `SUPER_ADMIN` | 1 — `sudhanshu.verma@grofers.com` |
| `SERVICE_ADMIN` | **0** |

### Blocking issues

| Severity | Issue |
|---|---|
| RED | **No `SERVICE_ADMIN` exists.** No diesel requisition can be approved. This blocks the diesel module going live. |
| RED | **14 sites have no POC.** They cannot be onboarded. |
| YELLOW | `AppScript_URL` empty for all six services — per-service files not yet created |
| YELLOW | `Go_Live_Date` empty on all 120 sites — needed for the compliance denominator |
| YELLOW | `City` empty on all 120 sites — absent from source data |
| YELLOW | 1 blank POC name, 2 blank phone numbers |

The `Data_Issues` tab carries the full list with per-row detail. It is **not part of the schema** — do not generate types from it.

---

## 11. Not built yet

- Master-data CRUD UI — sites and POCs are edited directly in Google Sheets
- The approval/validation lifecycle for any service other than Diesel
- Real authentication — `currentUser` is local state with a persona picker
- Any backend server; Firestore is planned but unscheduled
