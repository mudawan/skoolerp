# PROJECT SPECIFICATION DOCUMENT (PSD / SRS)
## Institutional Student Information, Fee Lifecycle & Transportation Management Platform (Skooler)

---

## 1. Document Control

### 1.1 Metadata
- **Document Title:** Software Requirements Specification & Functional Architecture: School Fee Lifecycle, Student Information & Transportation Platform
- **System Code Name:** Skooler Enterprise SIS/FMS
- **Version:** 1.0.0-FINAL
- **Status:** Approved for Implementation
- **Classification:** Confidential / Commercial Contract Baseline
- **Target Audience:** Engineering Leads, Database Architects, QA Engineers, Client Steering Committee

### 1.2 Revision History
| Version | Date | Author | Description of Changes |
| :--- | :--- | :--- | :--- |
| v0.1.0 | 2026-09-01 | Lead Systems Architect | Initial draft covering SIS and Voucher fundamentals |
| v0.5.0 | 2026-09-02 | Senior Business Analyst | Added Transportation, Defaulters Aging & Carry-Forward logic |
| v0.9.0 | 2026-09-03 | Technical Writer & QA Lead | Added 6-Tier Waterfall Fee Precedence, Month Closure & Audit Trail |
| v1.0.0 | 2026-09-04 | Principal Solutions Architect | Finalized contract baseline; updated financial rounding multiples to {1, 10, 20, 50} |

### 1.3 Approval Signatures
| Stakeholder Role | Name | Signature | Date |
| :--- | :--- | :--- | :--- |
| Project Sponsor / Client Executive | ___________________ | ___________________ | ____________ |
| Lead Systems Analyst | ___________________ | ___________________ | ____________ |
| Software Engineering Director | ___________________ | ___________________ | ____________ |
| Principal QA Engineer | ___________________ | ___________________ | ____________ |

---

## 2. Purpose, Scope, and Objectives

### 2.1 Executive Summary
Educational institutions face significant operational friction and financial leakage from manual fee billing, inaccurate sibling concessions, unmonitored transportation logistics, and chaotic reconciliation of physical bank challans. 

The Skooler platform provides an automated, auditable, single-source-of-truth solution governing the complete student financial and administrative lifecycle—from registration and family linking to multi-tier fee inheritance, bulk 3-copy bank voucher printing, point-of-sale and batch CSV collections, automated defaulter aging with multi-month carry-forward, pro-rated bus transportation logistics, and month-end accounting locks.

### 2.2 System Objectives
1. **Zero Financial Leakage:** Eliminate arbitrary discounts and undocumented fee waivers via an immutable 6-Tier Waterfall pricing engine.
2. **Standardized Bank Challan Lifecycle:** Automate generation and tracking of sequential, 3-copy bank-grade fee vouchers with dual-language (English LTR / Urdu RTL) deposit terms.
3. **Rigorous Debt Resolution:** Automatically categorize overdue accounts across 4 aging buckets and provide automated balance roll-over with cascading downstream reconciliation.
4. **Transport-to-Billing Coupling:** Directly bind vehicle routes and bus stop fares into monthly student tuition bills based on trip type and operational days.
5. **Month-End Integrity:** Prevent retroactive ledger manipulation through cryptographic-style administrative month closure workflows.

### 2.3 Boundary of Scope
- **In-Scope:**
  - Student Information Management & Document Attachment Metadata.
  - Household / Family Grouping with cross-sibling financial synchronization.
  - Academic Classes, Cohorts, and Base Fee Structures.
  - 6-Tier Fee Template Engine (Global, Class, Student, Monthly, and Recurring).
  - Monthly & Admission Voucher Generation with configurable rounding multiples {1, 10, 20, 50}.
  - Single & Bulk CSV Payment Collections with dual-tier validation.
  - Defaulter Escalation, Multi-Month Carry-Forward & Cascading Healing.
  - Fleet, Bus Stop, and Route Logistics with dynamic student fare calculation.
  - Historical Double-Entry Fee Ledgers and Student Administrative Timelines.
  - Granular 12-domain Role-Based Access Control and Immutable Audit Logging.
- **Explicitly Out-of-Scope:**
  - In-vehicle GPS live hardware tracking and IoT attendance card swiping.
  - School academic grading, LMS course content, and examination report cards.
  - Point-of-sale cafeteria/meal token redemptions and bookstore inventory sales.
  - Real-time payment gateway card-swipe terminals (system handles bank challan clearing, online transfer references, cheques, and cash desk payments).

---

## 3. Stakeholders, Actors, and User Roles

### 3.1 Actors & Persona Descriptions
1. **System Administrator (`Admin`):** Full superuser access to institution configuration, bank accounts, academic structure, user provisioning, global resets, and month-end overrides.
2. **Senior Accountant (`Accountant`):** Manages class fee baselines, executes monthly voucher generation runs, performs single and batch collections, processes carry-forward balance transfers, and initiates month-end closures.
3. **Cashier / Collections Clerk (`Custom / Cashier`):** Restricted operator authorized only to search students, accept fee payments, issue collection receipts, and view personal collection logs.
4. **Transport Manager (`Custom / TransportOfficer`):** Manages fleet vehicles, bus stops, monthly route assignments, and operational charging days.
5. **Auditor / Board Viewer (`Viewer`):** Read-only stakeholder granted access to dashboards, financial arrears reports, collection totals, and immutable audit logs.
6. **System / Background Daemon (`System`):** Internal scheduled processor that triggers automatic student status deactivations and scheduled notifications.

### 3.2 Role-Permission Matrix
The system enforces 12 granular permission domains across low, medium, and high-risk operations:

| Permission Key | Domain Description | Admin | Accountant | Cashier | Transport Mgr | Viewer |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `dashboard:view` | View operational KPIs and quick statistics | YES | YES | YES | YES | YES |
| `students:read` | View student profiles and demographic directories | YES | YES | YES | YES | YES |
| `students:create` | Register new admissions | YES | YES | NO | NO | NO |
| `students:edit` | Modify student records, discounts, and family links | YES | YES | NO | NO | NO |
| `students:delete` | Soft-delete / withdraw student records (HIGH RISK) | YES | NO | NO | NO | NO |
| `families:manage` | Create households and link sibling records | YES | YES | NO | NO | NO |
| `classes:manage` | Configure class levels, sections, and base tuition | YES | YES | NO | NO | NO |
| `fees:view` | Inspect fee templates and pricing waterfall rules | YES | YES | NO | NO | YES |
| `fees:manage` | Alter global/class/student fee override rosters | YES | YES | NO | NO | NO |
| `vouchers:generate` | Execute batch/individual fee voucher generation | YES | YES | NO | NO | NO |
| `vouchers:edit` | Manually adjust line items on issued vouchers | YES | YES | NO | NO | NO |
| `vouchers:delete` | Annul or permanently delete fee vouchers (HIGH RISK) | YES | NO | NO | NO | NO |
| `collections:collect` | Accept payments, issue receipts, and import CSV batches | YES | YES | YES | NO | NO |
| `collections:reverse` | Undo payment collections & roll back ledger (HIGH RISK)| YES | YES | NO | NO | NO |
| `defaulters:manage` | Carry forward balances, apply late fines, lock accounts | YES | YES | NO | NO | NO |
| `transport:manage` | Configure buses, stops, and student monthly routes | YES | YES | NO | YES | NO |
| `reports:view` | Access financial summaries and arrears statements | YES | YES | NO | NO | YES |
| `reports:export` | Download CSV and PDF financial data exports | YES | YES | NO | NO | YES |
| `audit:view` | Inspect the immutable operator audit trail | YES | YES | NO | NO | YES |
| `settings:manage` | Alter institution profile, banks, and rounding rules | YES | NO | NO | NO | NO |
| `users:manage` | Provision operators and assign granular privileges | YES | NO | NO | NO | NO |
| `system:purge` | Execute database factory resets or table purges | YES | NO | NO | NO | NO |

---

## 4. Domain Glossary and Mathematical Definitions

1. **Active Billing Month (`activeMonth`):** The primary institutional working period, formatted strictly as `YYYY-MM` (e.g., `2026-09`).
2. **Registration Number (`regNo`):** The immutable, unique, human-readable primary institutional identifier assigned to a student upon admission (e.g., `REG-1049`).
3. **Student Number (`studentNo`):** An internal indexed sequence number assigned to each student.
4. **Fee Particular (`ParticularKind`):** An itemized financial component on a voucher. Valid kinds:
   - `Tuition`: Regular monthly academic instruction fee.
   - `Transport`: Pro-rated transit fee derived from bus route and stop assignment.
   - `Flex1`, `Flex2`, `Flex3`, `Flex4`: Configurable institutional heads (e.g., Exam Fee, Lab Fee, Sports Fund, Library Levy).
   - `Discount`: Subtractive credit concession applied against the gross total.
   - `PreviousBalance`: Unpaid arrears rolled over from prior billing periods.
   - `Fine`: Penalty charge imposed for late settlement or disciplinary surcharge.
5. **Rounding Multiple (`roundingMultiple`):** An institutional parameter defining the currency multiple to which the net payable total must be rounded up. **Permitted values: `{1, 10, 20, 50}`.**
   - *Mathematical Formula:* 
     $$\text{netDue} = \lceil \frac{\text{rawNetDue}}{M} \rceil \times M \quad \text{where } M \in \{1, 10, 20, 50\}$$
6. **6-Tier Waterfall Precedence:** The strict hierarchical algorithm determining the exact fee amount for a student in a target month:
   - *Tier 1:* Student Month-Specific Override (Highest priority)
   - *Tier 2:* Student Recurring Override (All months)
   - *Tier 3:* Class Month-Specific Override
   - *Tier 4:* Class Recurring Override (All months)
   - *Tier 5:* Global Month-Specific Template
   - *Tier 6:* Global Default Baseline (Lowest priority)
7. **Challan / Fee Voucher (`FeeVoucher`):** An official financial debit instrument issued to a student for a specific month, bearing a unique sequential voucher code, due date, itemized particulars, and 3 counterfoil segments (**Bank Copy**, **Institute Copy**, **Student Copy**).
8. **Voucher Status Lifecycle:**
   - `Issued`: Generated and awaiting payment; no transactions recorded.
   - `Partial`: Partially settled; $0 < \text{amountPaid} < \text{netDue}$.
   - `Paid`: Fully settled; $\text{amountPaid} \ge \text{netDue}$.
   - `Carried`: Left unpaid and rolled forward into a subsequent billing voucher as arrears; closed from further direct payment.
   - `Reversed`: A payment previously collected against this voucher was revoked.
9. **Defaulter Severity Buckets:**
   - `Mild`: 1 month past due date without payment.
   - `Moderate`: 2 consecutive billing months unpaid.
   - `Severe`: 3 consecutive billing months unpaid.
   - `Critical`: 4 or more consecutive billing months unpaid (automatically flags student for enrollment deactivation).
10. **Downstream Cascade Resolution:** The mechanism whereby altering or rolling forward an unpaid balance automatically updates subsequent downstream vouchers already issued to that student, preventing double-counting or orphaned arrears.

---

## 5. System Context and High-Level Logical Architecture

```
+-----------------------------------------------------------------------------------+
|                               SKOOLER PLATFORM                                    |
|                                                                                   |
|  +--------------------+   +---------------------+   +--------------------------+  |
|  | Student & Family   |   | Academic Classes &  |   | 6-Tier Fee Template      |  |
|  | Management (SIS)   |-->| Base Structures     |-->| Engine (Waterfall)       |  |
|  +--------------------+   +---------------------+   +--------------------------+  |
|            |                                                     |                |
|            |                                                     v                |
|            |              +---------------------+   +--------------------------+  |
|            +------------->| Transport Logistics |-->| Batch Voucher Generation |  |
|                           | (Stops, Days, Fares)|   | & 3-Copy Challan Engine  |  |
|                           +---------------------+   +--------------------------+  |
|                                                                  |                |
|                                                                  v                |
|  +--------------------+   +---------------------+   +--------------------------+  |
|  | Month-End Closure  |<--| Defaulter Aging &   |<--| Collections & Payment    |  |
|  | & Period Lock      |   | Carry-Forward Engine|   | Reconciliation Engine    |  |
|  +--------------------+   +---------------------+   +--------------------------+  |
|            |                         |                           |                |
|            +-------------------------+---------------------------+                |
|                                      |                                            |
|                                      v                                            |
|                  +---------------------------------------+                        |
|                  | Double-Entry Ledgers, Reporting       |                        |
|                  | & Immutable Operator Audit Trail      |                        |
|                  +---------------------------------------+                        |
|                                      |                                            |
|                                      v                                            |
|                  +---------------------------------------+                        |
|                  | Relational Database (Source of Truth) |                        |
|                  +---------------------------------------+                        |
+-----------------------------------------------------------------------------------+
```

### 5.1 Architectural Invariants
1. **Database as Single Source of Truth:** All institutional data, fee templates, transactions, and audit records must be persisted in an ACID-compliant database. Client applications must never maintain transient uncommitted financial state.
2. **Transaction Isolation:** Financial operations—including batch voucher generation, payment collection, carry-forward balance transfers, and payment reversals—must execute within atomic database transactions.
3. **Audit Immutability:** Audit records (`audit_log`) and ledger history entries (`student_account_history`) are strictly append-only. They cannot be updated or deleted through application interfaces or administrative endpoints.

---

## 6. Functional Requirements Specification

### 6.1 Student Database & Family Household Management

#### [STU-001] Student Registration & Profile Management
- **Description:** Capture comprehensive student demographics, institutional identification, family links, and financial discount baselines.
- **Preconditions:** Operator must hold `students:create` privilege; Class ID must exist.
- **Main Success Scenario:**
  1. Operator inputs student full name, roll number, gender, date of birth, admission date, class assignment, and emergency contact details.
  2. Operator enters student ID / birth certificate number and parent national ID details.
  3. Operator specifies `firstBillingMonth` (format: `YYYY-MM`), establishing the earliest period this student may be billed.
  4. Operator specifies recurring `monthlyDiscount` (fixed amount in currency).
  5. System validates that `regNo` is globally unique and persists the student with `status = 'Active'`.
- **Validation Rules:**
  - `regNo` must be non-empty, unique (case-insensitive), and alphanumeric.
  - `admissionDate` cannot be in the future.
  - `monthlyDiscount` must be $\ge 0$.
  - `firstBillingMonth` must conform to `YYYY-MM`.

#### [STU-002] Document Attachment Metadata
- **Description:** Store verification metadata for student physical identification documents.
- **Business Rules:** Supported document kinds are `BirthCertificate`, `StudentID`, `FatherNationalID`, `MotherNationalID`, `TransferCertificate`, and `Other`. The system stores the document title, file URL/path, verification timestamp, and verifying officer ID.

#### [STU-003] Household / Family Management
- **Description:** Group related students (siblings) under a unified Family Household.
- **Business Rules:**
  - A Family record contains `familyNo` (unique, e.g., `FAM-001`), `headName` (Father/Guardian), primary phone, emergency phone, and residential address.
  - Multiple students may link to a single `familyId`.
  - When viewing any student, the system displays their family group and computes consolidated arrears across all enrolled siblings.

#### [STU-004] Student Status Lifecycle State Machine
- **Allowed States:** `Active`, `Inactive`, `AutoDeactivated`, `Withdrawn`, `Graduated`.
- **Transitions:**
  - `Active` $\rightarrow$ `Inactive` / `Withdrawn` / `Graduated`: Operator action requiring `students:edit`.
  - `Active` $\rightarrow$ `AutoDeactivated`: Automatically triggered by the system when a student's unpaid arrears reach `Critical` severity (4+ consecutive unpaid billing months).
  - `AutoDeactivated` $\rightarrow$ `Active`: Permitted only when overdue arrears are either fully settled or officially adjusted, requiring `students:edit` authorization.

#### [STU-005] Global Multi-Attribute Search & Directory Export
- **Description:** Provide sub-millisecond search across active and historical rosters by Name, Registration Number, Roll Number, Family Number, and Parent Mobile Number. Support structured CSV export of student demographic directories.

---

### 6.2 Academic Classes & Baseline Structure

#### [CLA-001] Class & Section Configuration
- **Description:** Manage institutional grade levels and base academic tuition.
- **Attributes:** Class Name (e.g., "Grade 5-A"), Numeric Grade Level, Display Sequence/Sort Order, Base Monthly Tuition Fee (`baseTuitionFee`), and Maximum Capacity.
- **Business Rules:**
  - Base tuition fee must be $\ge 0$.
  - Deleting a class is prohibited if active students are assigned to it.

---

### 6.3 Fee Pricing Engine & 6-Tier Waterfall Precedence

#### [FEE-001] 6-Tier Waterfall Resolution Logic
- **Description:** For every student and target month, the system evaluates fee heads across 6 prioritized tiers to compute the applicable rate.
- **Resolution Precedence Algorithm:**
  ```
  For each ParticularKind in [Tuition, Transport, Flex1, Flex2, Flex3, Flex4, Discount, Fine]:
    If exists FeeTemplate(studentId == Student.id AND month == targetMonth):
      Use Student-Month Override
    Else if exists FeeTemplate(studentId == Student.id AND month == 'all'):
      Use Student-Recurring Override
    Else if exists FeeTemplate(classId == Student.classId AND month == targetMonth):
      Use Class-Month Override
    Else if exists FeeTemplate(classId == Student.classId AND month == 'all'):
      Use Class-Recurring Override
    Else if exists FeeTemplate(studentId == NULL AND classId == NULL AND month == targetMonth):
      Use Global-Month Override
    Else if exists FeeTemplate(studentId == NULL AND classId == NULL AND month == 'all'):
      Use Global Baseline Template
    Else:
      Fallback to Class.baseTuitionFee (for Tuition) or 0 (for other heads)
  ```

#### [FEE-002] 9-Item Particulars Roster
- **Description:** Vouchers and templates support exactly 9 distinct fee particular heads:
  1. `Tuition`: Regular monthly academic instruction fee.
  2. `Transport`: Dynamic transportation fee derived from bus logistics module.
  3. `Flex1`: Configurable Institutional Head 1 (Default label: "Exam Fee").
  4. `Flex2`: Configurable Institutional Head 2 (Default label: "Lab / Computer Fee").
  5. `Flex3`: Configurable Institutional Head 3 (Default label: "Sports & Activities").
  6. `Flex4`: Configurable Institutional Head 4 (Default label: "Utility / Maintenance").
  7. `Discount`: Total student concession (aggregating waterfall discount and sibling rules).
  8. `PreviousBalance`: Arrears rolled forward from preceding billing cycles.
  9. `Fine`: Surcharge for late payment or disciplinary penalties.
- **Display Ordering:** Each particular stores a persistent `sortOrder` integer. Printable vouchers must render rows strictly in ascending `sortOrder`.

#### [FEE-003] Bulk CSV Template Override Import
- **Description:** Ingest student-specific overrides in bulk via CSV.
- **Validation:** Matches `regNo`, validates target month, displays pre-commit dry-run preview, flags unmatched students, and commits valid rows in a single atomic transaction.

---

### 6.4 Voucher Generation, Calculation & 3-Copy Bank Challan Engine

#### [VOU-001] Batch Monthly Voucher Generation Wizard
- **Description:** Mass-generate monthly fee vouchers for all active students or selected classes for a target billing month.
- **Preconditions:** Operator holds `vouchers:generate` privilege; target month is not locked under Month-End Closure.
- **Pre-Execution Conflict Detection:**
  - Detect students who already have an issued voucher for the target month (prevents duplicate billing).
  - Detect students whose `admissionDate` or `firstBillingMonth` is after the target month (excluded).
  - Detect students with `status != 'Active'`.
  - Calculate prior-month uncollected balances to flag arrears.

#### [VOU-002] Mathematical Calculation & Net Due Rounding Algorithm
- **Raw Fee Summation:**
  $$\text{grossPositive} = \text{Tuition} + \text{Transport} + \text{Flex1} + \text{Flex2} + \text{Flex3} + \text{Flex4} + \text{PreviousBalance} + \text{Fine}$$
  $$\text{rawNetDue} = \max(0, \text{grossPositive} - \text{Discount})$$
- **Mandatory Currency Rounding:**
  The system rounds $\text{rawNetDue}$ **UP** to the nearest configured institutional multiple:
  $$\text{netDue} = \text{roundUpToMultiple}(\text{rawNetDue}, M)$$
  **Where $M$ is strictly restricted to the configuration set:**
  $$M \in \{1, 10, 20, 50\}$$
  - *Example 1:* If $M = 10$ and $\text{rawNetDue} = 4,521 \implies \text{netDue} = 4,530$.
  - *Example 2:* If $M = 20$ and $\text{rawNetDue} = 4,521 \implies \text{netDue} = 4,540$.
  - *Example 3:* If $M = 50$ and $\text{rawNetDue} = 4,521 \implies \text{netDue} = 4,550$.
  - *Example 4:* If $M = 1$ and $\text{rawNetDue} = 4,521 \implies \text{netDue} = 4,521$.

#### [VOU-003] Due Date & Late Fee Application
- **Issue Date:** First calendar day of the billing month or actual generation date.
- **Due Date:** Configurable day-of-month offset (e.g., 10th of the billing month).
- **Late Fee Rate:** Configurable fixed surcharge (e.g., 200 currency units) or daily rate added to total payable after the due date.

#### [VOU-004] Standard 3-Copy Bank Challan Physical Printout
- **Page Layout:** A4 Landscape orientation subdivided into three equal vertical counterfoils:
  1. **Bank Copy:** Retained by the collecting financial institution.
  2. **Institute Copy:** Returned to the school accounts desk with the bank stamp.
  3. **Student Copy:** Retained by the student/guardian as proof of payment.
- **Counterfoil Contents:**
  - Header: School Name, Campus Address, Contact Phone, Tax/Registration ID.
  - Voucher Identity: Voucher Serial Number, Barcode, Issue Date, Due Date, Validity Date.
  - Student Demographics: Name, Registration Number, Class, Section, Family Number.
  - Itemized Financial Table: 9 particulars with individual amounts and bold Total Net Due.
  - Bank Accounts Roster: Approved deposit bank titles, account numbers, and branch IBANs.
  - Bilingual Payment Instructions:
    - **English (LTR):** Standard deposit rules, late fee deadlines, and cheque clearance notices.
    - **Right-to-left (RTL):** Optional bank teller and guardian instructions in any right-to-left script (Arabic, Urdu, Hebrew, ...).
  - Authorized Signatures: Blank counterfoil signature blocks for Cashier/Teller and Depositor.

#### [VOU-005] Admission Voucher Engine
- **Description:** Ability to generate a one-off pre-enrollment voucher covering admission fees, registration charges, and first-term security deposits separate from regular monthly runs.

---

### 6.5 Collections, Cashiering & Payment Reconciliation

#### [COL-001] Single Voucher Payment Settlement
- **Description:** Record cash, cheque, or electronic bank receipts against an issued voucher.
- **Fields:** Payment Date, Amount Paid, Payment Mode (`Cash`, `BankTransfer`, `Cheque`, `Online`), Bank Reference / Cheque Number, Cashier Notes.
- **Validation & State Transitions:**
  - If $\text{Amount Paid} \le 0$, reject transaction.
  - If $\text{Amount Paid} < \text{netDue} - \text{amountPaid}$, voucher transitions to `Partial`.
  - If $\text{Amount Paid} \ge \text{netDue} - \text{amountPaid}$, voucher transitions to `Paid`.
  - System generates a unique `collectionNo` and child `transactionNo`.
  - System recalculates student real-time ledger balance.

#### [COL-002] Instant Payment Receipts
- **Description:** Immediately upon recording a collection, generate a printable receipt:
  - **Compact POS Slip:** 80mm thermal receipt format for cash counter handoff.
  - **Standard A4 Receipt:** Formal stamped institutional voucher slip.

#### [COL-003] Bulk CSV Collections Processing Engine
- **Description:** Automated reconciliation of bank scroll sheets / payment spreadsheets.
- **Header Mapping:** Auto-detects columns for Student ID / Reg No, Paid Amount, Fine, Payment Date, Payment Mode, and Reference Number.
- **Two-Tier Validation Workflow:**
  1. **Pre-Import Analysis & Dry-Run Preview Table:**
     - Evaluates every row against the active student database.
     - Unmatched Student IDs / Reg Nos are flagged as **Invalid**.
     - System displays an amber tag: `No student found with Reg # "<ID>"`.
     - Checkboxes for invalid rows are **locked in the unchecked state**, preventing batch inclusion.
     - "Toggle Select All" skips invalid rows automatically.
  2. **Atomic Batch Execution:**
     - Only checked, valid rows are submitted.
     - Executes inside a single transaction, creating parent `FeeCollection` and child `PaymentTransaction` records.
     - Skips invalid rows with logged error diagnostics without aborting valid entries.

#### [COL-004] Payment Reversal / Voiding Workflow (High Risk)
- **Description:** Authorizes high-level accountants to revoke erroneous collections.
- **Behavior:** Revokes transaction, subtracts paid amount from voucher, restores voucher status to `Issued` or `Partial`, re-establishes student arrears balance, and writes a mandatory audit log entry with operator justification.

---

### 6.6 Defaulters Management, Aging & Month-End Closure Wizard

#### [DEF-001] Automated Defaulter Classification & Aging Engine
- **Aging Severity Calculation:**
  Evaluates all students with unpaid voucher balances as of the current date:
  - **Mild (1 Month Overdue):** Due date passed; payment missing for current cycle.
  - **Moderate (2 Months Overdue):** Two consecutive billing months unpaid.
  - **Severe (3 Months Overdue):** Three consecutive billing months unpaid.
  - **Critical (4+ Months Overdue):** Four or more billing months unpaid; student marked for administrative suspension.

#### [DEF-002] Unpaid Voucher Carry-Forward & Debt Rolling
- **Description:** When rolling uncollected fees into a new billing cycle, the system moves the outstanding debt into the next voucher as `PreviousBalance`.
- **Workflow:**
  1. Source voucher outstanding balance is tallied: $\text{unpaidBalance} = \text{netDue} - \text{amountPaid}$.
  2. Operator can optionally apply a late penalty surcharge (`carriedLateFine`).
  3. Source voucher status transitions to `Carried`.
  4. Next month's voucher is created or updated with `PreviousBalance = unpaidBalance + carriedLateFine`.
  5. Downstream Cascade Healing: If the destination month voucher already exists, its particulars are updated in place, recomputing `netDue` with the configured rounding multiple.
- **Undo Carry-Forward:** Permits reversal of rolled balance if executed in error before the destination voucher is settled.

#### [DEF-003] Month-End Financial Closure & Period Locking Wizard
- **Description:** Formal institutional accounting mechanism to close and permanently seal a historical billing period.
- **Pre-Closure Audit Invariant:**
  The wizard audits all vouchers for the period. If any uncollected vouchers remain that have **not** been either settled (`Paid`) or rolled forward (`Carried`), the system blocks month closure with a validation error:
  `"Cannot close month: X vouchers remain in Issued/Partial state. All unpaid vouchers must be settled or carried forward before sealing."`
- **Sealing Effect:**
  Once sealed, the month is locked. The system rejects any attempts to:
  - Generate new vouchers for that month.
  - Edit template overrides or line items for that month.
  - Delete vouchers or alter historical fee configurations.

---

### 6.7 Transportation Logistics & Automated Fee Calculation

#### [TRN-001] Fleet Vehicle & Bus Stop Management
- **Bus Entity:** Bus Identifier (e.g., "Bus-04"), Vehicle Registration Plate, Model/Make, Driver Full Name, Driver Mobile Phone Number, Route Name, and Seating Capacity.
- **Bus Stop Entity:** Stop Name, Geolocation / Landmark Reference, Display Sequence on Route, and Base Monthly Stop Fare (`fare`).

#### [TRN-002] Month-Scoped Student Transport Assignments
- **Description:** Transport allocations are assigned per student per billing month, accommodating seasonal changes, vacation waivers, and seat shifts.
- **Attributes:** `studentId`, `month`, `busId`, `stopId`, `tripType` (`RoundTrip` | `OneWay`), `daysCharged` (integer, 1–30), and `discount` (currency waiver).

#### [TRN-003] Dynamic Transport Fee Calculation Formula
- When a voucher is generated, the `Transport` line item is dynamically computed:
  $$\text{tripFactor} = \begin{cases} 1.0 & \text{if } \text{tripType} = \text{'RoundTrip'} \\ 0.5 & \text{if } \text{tripType} = \text{'OneWay'} \end{cases}$$
  $$\text{baseProrated} = \text{Stop.fare} \times \text{tripFactor} \times \left( \frac{\text{daysCharged}}{30} \right)$$
  $$\text{TransportFee} = \max(0, \text{baseProrated} - \text{discount})$$
- The resulting `TransportFee` is injected directly into the student's voucher particulars roster.

#### [TRN-004] Transport Batch Operations
- **Copy Roster Forward:** One-click cloning of all bus and stop assignments from Month $T$ into Month $T+1$.
- **Bulk Days Adjustment:** Mass-update `daysCharged` across all students assigned to a specific bus route (e.g., during exam seasons or shortened winter months).

---

### 6.8 Reporting, Financial Analytics & Student Ledger

#### [REP-001] Real-Time Student Fee Ledger (`StudentFeeLedger`)
- Chronological double-entry running balance statement for an individual student:
  - Displays Invoices (Debits), Payments (Credits), Concessions, Late Fines, and Net Balance.
  - Filterable by date window and printable as a formal Statement of Account.

#### [REP-002] Student Administrative History Timeline
- Immutable timeline displaying life-cycle events:
  - Admission, class promotions, family linking, transport changes, discount modifications, and account deactivations.

#### [REP-003] Standard Management Reports
1. **Outstanding Arrears Report:** Multi-level grouping (by Class, Section, Family) showing total billed, total collected, and outstanding balance with aging categorization.
2. **Defaulter Roll Call:** Filterable list of students in Severe and Critical aging categories with guardian contact details for recovery outreach.
3. **Daily Cashier Reconciliation:** Breakdown of cash, online transfers, and cheques received across any target date window with operator signatures.
4. **Class-Wise Collection Performance:** Comparative collection percentages across all grade levels.

---

### 6.9 Security, Audit Trail & System Administration

#### [SEC-001] Immutable Operator Audit Trail
- System records every state change in an append-only log containing:
  - Unique Log ID, Timestamp (UTC), Operator User ID, Operator Role, Client IP.
  - Action Category (e.g., `VoucherGenerate`, `PaymentCollect`, `PaymentReverse`, `OverrideSave`, `CarryForward`, `MonthClose`).
  - Target Entity ID (e.g., `VOU-00491`), Target Student Registration Number.
  - Financial Delta: Previous Balance $\rightarrow$ New Balance, Amount Paid.
  - Metadata payload capturing serialized JSON state deltas.

#### [SEC-002] Institutional Profile & Multi-Bank Setup
- Institutional Name, Logo, Tax Registration Number, Physical Campus Address, Phone, Website.
- Multi-Bank Configuration: Bank Name, Account Title, Account Number, Branch Code, IBAN, and Custom Challan Printing Instructions (English LTR and Urdu RTL).

#### [SEC-003] Configurable Financial Policy Rules
- **Rounding Multiple Parameter:** Global configuration restricting net due rounding to:
  $$\text{roundingMultiple} \in \{1, 10, 20, 50\}$$
- **Prior-Month Generation Rule:** Controls behavior when generating Month $T$ while Month $T-1$ remains unpaid (`StrictBlock`, `WarnAndProceed`, `AutoRollArrears`).
- **Skipped-Month Generation Rule:** Controls behavior when generating a future month leaving intervening months unbilled.

#### [SEC-004] Database Purge & Factory Reset Safeguards
- Administrative utility allowing superusers to purge operational test data while preserving core institutional setup (classes, bank accounts, institute profile). Protected by high-risk dual confirmation barriers.

---

## 7. Data Model Specification

### 7.1 Entity-Relationship Schema Overview

```
 [InstituteProfile] 1 --- * [BankAccount]
 
 [SchoolClass] 1 --- * [Student]
 [Family]       1 --- * [Student]
 
 [Student] 1 --- * [FeeTemplate]
 [Student] 1 --- * [FeeVoucher]
 [Student] 1 --- * [TransportAssignment]
 [Student] 1 --- * [StudentAccountHistory]
 
 [FeeVoucher] 1 --- * [VoucherItem]
 [FeeVoucher] 1 --- * [PaymentTransaction]
 [FeeCollection] 1 --- * [PaymentTransaction]
 
 [TransportBus]  1 --- * [TransportAssignment]
 [TransportStop] 1 --- * [TransportAssignment]
 
 [AuditLog] (Global Append-Only Entity)
 [MonthClosureStatus] (Unique by Month)
```

### 7.2 Detailed Logical Entities & Data Dictionary

#### Entity: `institutes`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `name` | VARCHAR(255) | NOT NULL | Official school/college title |
| `tagline` | VARCHAR(255) | NULL | Institutional slogan |
| `address` | TEXT | NOT NULL | Physical campus address |
| `phone` | VARCHAR(50) | NOT NULL | Contact telephone |
| `email` | VARCHAR(100) | NULL | Official administrative email |
| `website` | VARCHAR(100) | NULL | Web portal address |
| `logo_url` | TEXT | NULL | Media storage URL for emblem |
| `created_at` | TIMESTAMP | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL | Record modification timestamp |

#### Entity: `bank_accounts`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `bank_name` | VARCHAR(100) | NOT NULL | Commercial bank title |
| `account_title` | VARCHAR(150) | NOT NULL | Name on bank account |
| `account_number` | VARCHAR(50) | NOT NULL | Account number |
| `iban` | VARCHAR(50) | NULL | International Bank Account Number |
| `branch_code` | VARCHAR(50) | NULL | Branch transit code |
| `english_instructions` | TEXT | NULL | Deposit terms in English (LTR) |
| `instructions_rtl` | TEXT | NULL | Deposit terms in a right-to-left script |
| `is_active` | BOOLEAN | DEFAULT TRUE | Active payment channel flag |

#### Entity: `school_classes`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `name` | VARCHAR(100) | NOT NULL, UNIQUE | Class display title (e.g. "Grade 1-A") |
| `grade_level` | INTEGER | NOT NULL | Numeric academic progression tier |
| `base_tuition_fee` | DECIMAL(12,2)| NOT NULL | Baseline tuition before overrides |
| `sort_order` | INTEGER | NOT NULL | Rendering sequence order |
| `capacity` | INTEGER | DEFAULT 40 | Target classroom seat count |

#### Entity: `families`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `family_no` | VARCHAR(50) | NOT NULL, UNIQUE | Household reference (e.g. "FAM-0012") |
| `head_name` | VARCHAR(150) | NOT NULL | Father or primary guardian full name |
| `primary_phone` | VARCHAR(50) | NOT NULL | Primary contact mobile |
| `emergency_phone`| VARCHAR(50) | NULL | Secondary contact number |
| `address` | TEXT | NULL | Residential address |

#### Entity: `students`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `reg_no` | VARCHAR(50) | NOT NULL, UNIQUE | Registration number (case-insensitive) |
| `student_no` | INTEGER | NOT NULL, UNIQUE | Sequential institutional index |
| `name` | VARCHAR(150) | NOT NULL | Student full name |
| `father_name` | VARCHAR(150) | NOT NULL | Father/Guardian name |
| `roll_no` | VARCHAR(50) | NULL | Classroom roll call tag |
| `gender` | VARCHAR(20) | NOT NULL | Gender ('Male', 'Female', 'Other') |
| `dob` | DATE | NOT NULL | Date of birth |
| `admission_date` | DATE | NOT NULL | Date admitted to institution |
| `first_billing_month` | VARCHAR(7) | NOT NULL | Inception billing cycle ('YYYY-MM') |
| `class_id` | VARCHAR(64) | FK $\rightarrow$ `school_classes.id` | Current assigned class |
| `family_id` | VARCHAR(64) | FK $\rightarrow$ `families.id`, NULL | Household association |
| `monthly_discount` | DECIMAL(12,2)| DEFAULT 0.00 | Recurring fixed fee concession |
| `status` | VARCHAR(30) | NOT NULL | 'Active', 'Inactive', 'AutoDeactivated', 'Withdrawn' |
| `photo_url` | TEXT | NULL | Avatar image URL |
| `student_national_id` | VARCHAR(50) | NULL | National identity / birth record number |
| `father_national_id` | VARCHAR(50) | NULL | Father national ID card number |
| `mother_national_id` | VARCHAR(50) | NULL | Mother national ID card number |

#### Entity: `fee_templates`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `student_id` | VARCHAR(64) | FK $\rightarrow$ `students.id`, NULL | Specific student target (Tiers 1 & 2) |
| `class_id` | VARCHAR(64) | FK $\rightarrow$ `school_classes.id`, NULL | Class cohort target (Tiers 3 & 4) |
| `month` | VARCHAR(7) | NOT NULL | 'all' for recurring, or 'YYYY-MM' |
| `kind` | VARCHAR(30) | NOT NULL | ParticularKind enum |
| `label` | VARCHAR(100) | NOT NULL | Line-item title on challan |
| `amount` | DECIMAL(12,2)| NOT NULL | Assigned currency rate |
| `sort_order` | INTEGER | NOT NULL | Sequence position on voucher |

#### Entity: `fee_vouchers`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `voucher_no` | VARCHAR(50) | NOT NULL, UNIQUE | Serial number (e.g. "FE2026-000123") |
| `student_id` | VARCHAR(64) | FK $\rightarrow$ `students.id` | Target student |
| `class_id` | VARCHAR(64) | FK $\rightarrow$ `school_classes.id` | Class at time of generation |
| `month` | VARCHAR(7) | NOT NULL | Billing period ('YYYY-MM') |
| `issue_date` | DATE | NOT NULL | Issuance date |
| `due_date` | DATE | NOT NULL | Payment deadline |
| `validity_date` | DATE | NOT NULL | Counter voucher expiration date |
| `late_fee_rate` | DECIMAL(12,2)| DEFAULT 0.00 | Applicable late surcharge |
| `rounding_multiple` | INTEGER | NOT NULL | Applied multiple: 1, 10, 20, or 50 |
| `net_due` | DECIMAL(12,2)| NOT NULL | Final payable amount (rounded) |
| `amount_paid` | DECIMAL(12,2)| DEFAULT 0.00 | Total settled to date |
| `status` | VARCHAR(30) | NOT NULL | 'Issued', 'Partial', 'Paid', 'Carried', 'Reversed' |
| `carried_late_fine` | DECIMAL(12,2)| DEFAULT 0.00 | Penalty rolled into arrears |
| `notes` | TEXT | NULL | Administrative remarks |

#### Entity: `voucher_items`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `voucher_id` | VARCHAR(64) | FK $\rightarrow$ `fee_vouchers.id` | Parent fee voucher |
| `kind` | VARCHAR(30) | NOT NULL | ParticularKind enum |
| `label` | VARCHAR(100) | NOT NULL | Line-item description |
| `amount` | DECIMAL(12,2)| NOT NULL | Line-item currency amount |
| `sort_order` | INTEGER | NOT NULL | Visual ordering index |

#### Entity: `fee_collections`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `collection_no` | VARCHAR(50) | NOT NULL, UNIQUE | Cashier receipt sequence number |
| `date` | DATE | NOT NULL | Collection timestamp |
| `total_amount` | DECIMAL(12,2)| NOT NULL | Aggregate currency received |
| `payment_mode` | VARCHAR(30) | NOT NULL | 'Cash', 'BankTransfer', 'Cheque', 'Online' |
| `reference_no` | VARCHAR(100) | NULL | Cheque/Scroll transaction reference |
| `collected_by` | VARCHAR(64) | NOT NULL | Operator ID who received funds |
| `notes` | TEXT | NULL | Reconciliation notes |

#### Entity: `payment_transactions`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `collection_id` | VARCHAR(64) | FK $\rightarrow$ `fee_collections.id` | Parent collection batch/event |
| `voucher_id` | VARCHAR(64) | FK $\rightarrow$ `fee_vouchers.id` | Target voucher credited |
| `student_id` | VARCHAR(64) | FK $\rightarrow$ `students.id` | Credited student |
| `transaction_no`| VARCHAR(50) | NOT NULL, UNIQUE | Individual transaction serial code |
| `amount` | DECIMAL(12,2)| NOT NULL | Amount applied to this voucher |
| `payment_mode` | VARCHAR(30) | NOT NULL | Transaction payment channel |
| `payment_date` | DATE | NOT NULL | Date applied |
| `status` | VARCHAR(30) | DEFAULT 'Completed' | 'Completed' or 'Reversed' |

#### Entity: `transport_buses`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `bus_number` | VARCHAR(50) | NOT NULL, UNIQUE | Bus name / code (e.g. "Bus-02") |
| `registration_no`| VARCHAR(50) | NOT NULL | Official motor vehicle plate number |
| `driver_name` | VARCHAR(150) | NOT NULL | Assigned driver full name |
| `driver_phone` | VARCHAR(50) | NOT NULL | Driver contact telephone |
| `route_name` | VARCHAR(150) | NOT NULL | Name of geographical route |
| `capacity` | INTEGER | NOT NULL | Maximum passenger limit |

#### Entity: `transport_stops`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `name` | VARCHAR(150) | NOT NULL | Stop name / neighborhood |
| `area` | VARCHAR(150) | NULL | Sector or locality |
| `fare` | DECIMAL(12,2)| NOT NULL | Standard monthly base fare |
| `sort_order` | INTEGER | NOT NULL | Sequence position along the route |

#### Entity: `transport_assignments`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `student_id` | VARCHAR(64) | FK $\rightarrow$ `students.id` | Assigned passenger |
| `bus_id` | VARCHAR(64) | FK $\rightarrow$ `transport_buses.id` | Allocated vehicle |
| `stop_id` | VARCHAR(64) | FK $\rightarrow$ `transport_stops.id` | Boarding/Disembarking station |
| `month` | VARCHAR(7) | NOT NULL | Applicable month ('YYYY-MM') |
| `trip_type` | VARCHAR(30) | NOT NULL | 'RoundTrip' or 'OneWay' |
| `days_charged` | INTEGER | DEFAULT 30 | Active charging days (1–30) |
| `discount` | DECIMAL(12,2)| DEFAULT 0.00 | Transport-specific concession |

#### Entity: `month_closures`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `month` | VARCHAR(7) | NOT NULL, UNIQUE | Sealed billing period ('YYYY-MM') |
| `is_closed` | BOOLEAN | NOT NULL | Lock state |
| `closed_at` | TIMESTAMP | NOT NULL | Sealing timestamp |
| `closed_by` | VARCHAR(64) | NOT NULL | Operator who authorized closure |
| `closure_notes` | TEXT | NULL | Reconciliation summary log |

#### Entity: `audit_logs`
| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | VARCHAR(64) | PK | Unique identifier |
| `timestamp` | TIMESTAMP | NOT NULL | UTC event timestamp |
| `action_type` | VARCHAR(50) | NOT NULL | Categorized operation keyword |
| `user_id` | VARCHAR(64) | NOT NULL | Actor user identifier |
| `user_name` | VARCHAR(150) | NOT NULL | Actor display name |
| `user_role` | VARCHAR(50) | NOT NULL | Actor privilege tier |
| `target_id` | VARCHAR(64) | NOT NULL | Target entity identifier |
| `target_label` | VARCHAR(255) | NULL | Descriptive target name |
| `month` | VARCHAR(7) | NULL | Related billing month |
| `amount` | DECIMAL(12,2)| NULL | Monetary impact where applicable |
| `metadata` | JSON / TEXT | NOT NULL | Pre/post serialized payload |

---

## 8. Business Rules Catalog

| Rule ID | Domain | Name | Formal Rule Definition |
| :--- | :--- | :--- | :--- |
| **BR-FEE-001** | Fee Math | **Rounding Multiple Constraint** | The net due amount of any generated or manually adjusted fee voucher must be rounded UP to the nearest multiple $M \in \{1, 10, 20, 50\}$. Values outside this set are prohibited. |
| **BR-FEE-002** | Fee Math | **Non-Negative Net Due** | Net payable amount on a voucher cannot be negative: $\text{netDue} \ge 0$. If total deductions exceed charges, $\text{netDue} = 0$. |
| **BR-FEE-003** | Waterfall | **Override Exclusivity** | More specific tiers in the 6-Tier Waterfall completely shadow less specific tiers for that specific `ParticularKind`. They do not sum together. |
| **BR-VOU-001** | Vouchers | **First Billing Month Guard** | No voucher may be generated for a student for any month preceding that student's `firstBillingMonth` or `admissionDate`. |
| **BR-VOU-002** | Vouchers | **Duplicate Voucher Ban** | A student cannot have more than one regular monthly voucher for the same billing month. |
| **BR-VOU-003** | Vouchers | **Period Lock Guard** | No voucher may be created, edited, or deleted for a month whose `month_closures.is_closed == TRUE`. |
| **BR-COL-001** | Collections | **No Orphan Payments** | A payment transaction cannot be accepted without being linked to a valid, existing, open voucher (`Issued` or `Partial`). |
| **BR-COL-002** | Collections | **Overpayment Floor** | Overpayments beyond the uncollected balance are either prohibited or held as unallocated credit according to institutional policy; amount paid cannot exceed balance. |
| **BR-DEF-001** | Defaulters | **Critical Status Lockout** | A student with unpaid vouchers spanning 4 or more consecutive billing months must have their status updated to `AutoDeactivated` by the system. |
| **BR-DEF-002** | Defaulters | **Carry-Forward Precedence** | When a voucher balance is carried forward into Month $T+1$, the source voucher status transitions to `Carried` and cannot accept direct payments. |
| **BR-CLS-001** | Month-End | **Zero-Uncarried-Debt Invariant** | A billing month cannot be sealed if any voucher in that month remains in `Issued` or `Partial` status without being carried forward or voided. |
| **BR-TRN-001** | Transport | **One-Way Halving Rule** | If a transport assignment `trip_type` is `OneWay`, the computed base fare is exactly $50\%$ of the bus stop base fare: $\text{tripFactor} = 0.5$. |
| **BR-AUD-001** | Audit | **Immutability Enforcement** | Records in `audit_logs` are write-once. No database role, including superuser, may perform `UPDATE` or `DELETE` on this table. |

---

## 9. Non-Functional Requirements

### 9.1 Performance & Throughput
- **Batch Voucher Generation:** Must compute waterfall inheritance, apply transport charges, perform currency rounding, and persist vouchers for an institution of 5,000 students in under **30 seconds**.
- **Search Response:** Student multi-attribute search queries must return results in under **100 milliseconds** over a dataset of 50,000 student records.
- **Bulk CSV Ingestion:** Processing and validating a 1,000-row collection CSV file must complete in under **3 seconds**.

### 9.2 Financial Precision & Data Integrity
- **Floating-Point Avoidance:** All financial computations must use fixed-precision decimal data types (e.g., `DECIMAL(12,2)` or integer minor currency units / cents) to eliminate IEEE 754 binary floating-point drift.
- **ACID Transactions:** Every financial settlement, carry-forward cascade, and payment reversal must be wrapped in a database transaction with `READ COMMITTED` or `SERIALIZABLE` isolation.

### 9.3 Security & Regulatory Compliance
- **Role Isolation:** Application API endpoints must validate user role tokens and verify specific permissions against the Role-Permission Matrix prior to executing service logic.
- **Data Protection:** Passwords must be hashed using strong cryptographic one-way functions (e.g., Argon2id or bcrypt). National identification numbers (student and parent national IDs) must be encrypted at rest.

### 9.4 High Availability & Disaster Recovery
- **Single Source of Truth:** Relational database backups must be scheduled with automated point-in-time recovery (PITR) supporting recovery point objectives (RPO) $\le 1$ hour.

---

## 10. External Interfaces and Logical Integrations

### 10.1 Bank Deposit Counterfoil Interchange (Logical)
- The system generates 3-copy physical challans intended for over-the-counter deposit at commercial bank branches.
- Counterfoils feature standard optical barcodes encoding:
  $$\text{Barcode Payload} = \text{VoucherNo} \mathbin{\Vert} \text{RegNo} \mathbin{\Vert} \text{Month} \mathbin{\Vert} \text{NetDue}$$

### 10.2 Bulk Bank Scroll File Ingestion
- Ingestion interface accepting Comma-Separated Values (`.csv`) matching the schema:
  `[RegistrationNumber, AmountPaid, FineAmount, PaymentDate, PaymentMode, ReferenceNumber]`

---

## 11. Workflows and State Machines

### 11.1 Fee Voucher Lifecycle State Diagram
```
                     [ Start ]
                         |
                         | (Batch or Individual Generation)
                         v
                    +----------+
                    |  Issued  |<-------------------------------+
                    +----------+                                |
                         |                                      |
         +---------------+---------------+                      |
         | (Partial Payment)             | (Full Payment)       | (Payment Reversal)
         v                               v                      |
   +-----------+                   +-----------+                |
   |  Partial  |                   |   Paid    |----------------+
   +-----------+                   +-----------+
         |                               |
         | (Full Settlement)             |
         +-------------------------------+
         |
         | (Month-End Defaulter Carry-Forward)
         v
   +-----------+
   |  Carried  | (Debt transferred to next month; locked from direct payment)
   +-----------+
```

### 11.2 Student Defaulter Escalation State Diagram
```
  [Unpaid Current Voucher]
             |
             v
     [ Mild Defaulter ] (1 Month Past Due)
             |
             | (Intervening Month Passes Unpaid)
             v
   [ Moderate Defaulter ] (2 Months Overdue)
             |
             | (Third Month Passes Unpaid)
             v
    [ Severe Defaulter ] (3 Months Overdue)
             |
             | (Fourth Month Passes Unpaid)
             v
   [ Critical Defaulter ] (4+ Months Overdue)
             |
             v
  [ AutoDeactivated ] ===> Student status locked; admission suspended
```

---

## 12. Acceptance Criteria and Test Scenarios

### Test Scenario 1: Sibling Concession & Household Consolidated Balance
- **Given:** Two students, `STU-A` and `STU-B`, are linked under Family `FAM-100`. `STU-A` has an unpaid arrears voucher of $2,500$ and `STU-B` has an unpaid voucher of $3,000$.
- **When:** An operator views the student profile for `STU-A`.
- **Then:** The system must render `STU-A`'s individual balance as $2,500$ and display a prominent consolidated Household Arrears banner showing $5,500$ across both siblings.

### Test Scenario 2: 6-Tier Waterfall Inheritance Conflict
- **Given:**
  - Global Tuition baseline is set to $5,000$.
  - Class 5 Recurring Tuition template is set to $4,500$.
  - Student `REG-001` (in Class 5) has a Student-Recurring Tuition override of $4,000$.
  - Student `REG-001` has a Student Month-Specific override for September 2026 of $3,500$.
- **When:** September 2026 vouchers are generated.
- **Then:** The system must bill `REG-001` exactly $3,500$ for Tuition, proving Tier 1 takes strict precedence over Tiers 2, 4, and 6.

### Test Scenario 3: Financial Rounding Multiples Compliance
- **Given:** A student has Tuition = $4,120$, Flex1 = $105$, and Discount = $200$. Raw net due is $4,120 + 105 - 200 = 4,025$.
- **When:** Vouchers are generated under different configured rounding multiples:
  - Under Multiple $M = 1$: System records $\text{netDue} = 4,025$.
  - Under Multiple $M = 10$: System records $\text{netDue} = 4,030$.
  - Under Multiple $M = 20$: System records $\text{netDue} = 4,040$.
  - Under Multiple $M = 50$: System records $\text{netDue} = 4,050$.
- **Then:** Values must match these exact figures. Attempts to set multiple to $5$ or $100$ must be rejected by system validation.

### Test Scenario 4: Pro-Rated Transport Fee Injection
- **Given:** Bus Stop "Sector 4" base fare is $3,000$. Student is assigned `OneWay` transit with `days_charged = 15` and a transport discount of $100$.
- **When:** Generating the monthly voucher.
- **Then:** 
  $$\text{Base} = 3,000 \times 0.5 \times \left(\frac{15}{30}\right) = 750$$
  $$\text{TransportFee} = \max(0, 750 - 100) = 650$$
  The voucher's `Transport` line item must equal exactly $650$.

### Test Scenario 5: Bulk CSV Collection with Invalid Student ID
- **Given:** An operator uploads a collection CSV containing 3 rows:
  - Row 1: Valid Student `REG-01`, Amount $5,000$.
  - Row 2: Non-existent Student `REG-GHOST`, Amount $3,000$.
  - Row 3: Valid Student `REG-03`, Amount $4,000$.
- **When:** File is parsed in the bulk collection modal.
- **Then:**
  1. The preview table flags Row 2 with an amber warning: `No student found with Reg # "REG-GHOST"`.
  2. The checkbox for Row 2 is disabled and forced unchecked.
  3. Clicking "Commit Valid Rows" imports Rows 1 and 3 ($9,000$ total) and records zero mutations for Row 2.

### Test Scenario 6: Month-End Closure Blocking
- **Given:** Month `2026-08` contains 120 vouchers: 118 are `Paid`, 1 is `Carried`, and 1 is `Issued` ($1,500$ unpaid).
- **When:** An accountant attempts to seal `2026-08` using the Month-End Closure Wizard.
- **Then:** The system aborts the operation, prevents the lock, and displays:
  `"Cannot close month: 1 voucher remains in Issued/Partial state. Settle or carry forward all balances prior to sealing."`

---

## 13. Assumptions, Dependencies, and Constraints

1. **Relational Database Backend:** The operational system requires an enterprise-grade relational database engine supporting foreign key constraints, unique indexing, and multi-statement ACID transactions.
2. **Standard Currency Denominations:** The system assumes a single primary operating institutional currency per campus.
3. **Hardware Printer Compatibility:** The 3-copy bank voucher format assumes standard A4 paper support (210mm x 297mm) rendered at 300 DPI in landscape mode.
4. **Time Zone Standard:** All financial ledger events and audit trail timestamps are recorded in UTC and presented to operators in institutional local time.

---

## 14. Appendices

### Appendix A: Permitted Particular Heads Enum
```
ParticularKind:
  - Tuition
  - Transport
  - Flex1
  - Flex2
  - Flex3
  - Flex4
  - Discount
  - PreviousBalance
  - Fine
```

### Appendix B: Configurable Currency Rounding Multiples
```
PermittedRoundingMultiples: [1, 10, 20, 50]
DefaultRoundingMultiple: 10
RoundingMode: CEIL (Always round up to preserve fee coverage)
```

### Appendix C: Standard Document Change Control & Handover
This document constitutes the binding functional scope for the human software engineering team. Any modifications to calculations, state lifecycles, or data structures require formal engineering change orders (ECO) approved by both the Project Sponsor and Lead Systems Architect.
