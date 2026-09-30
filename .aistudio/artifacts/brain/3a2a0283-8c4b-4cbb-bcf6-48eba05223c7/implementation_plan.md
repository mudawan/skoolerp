# Transport Rounding Preset Steps (1, 10, 20, 50)

Update the transport fare rounding preset options in the Policies configuration to 1, 10, 20, and 50 so administrators can quickly round bus/van fares to standard Pakistani rupee denominations.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Preset Denominations**: The transport fee rounding preset menu will be updated from `[1, 5, 10, 50, 100]` to `[1, 10, 20, 50]`, aligning directly with the general fee voucher rounding steps.
> - **Direct Number Input**: Administrators retain the ability to type any custom positive integer (1 to 10,000) into the input box if a custom multiple is ever needed.

- **Confirmed Decision 1**: Set `TRANSPORT_ROUNDING_PRESETS` values to `[1, 10, 20, 50]`.
- **Confirmed Decision 2**: Provide clear contextual descriptions for each preset step (e.g. Exact/no rounding, nearest Rs. 10, nearest Rs. 20, and nearest Rs. 50).

---

### 1. Overview & Core Concept

- **What It Does**: In **Settings > Policies & Rules > Transport Fee Rounding Policy**, the dropdown presets for "Round Transport Fee Up to Nearest Multiple" will offer the exact steps: **Exact (1)**, **Rs. 10**, **Rs. 20**, and **Rs. 50**.
- **Target Audience / Persona**: School administrators and transport coordinators who configure proration and rounding rules for school bus and van routes.
- **Key Value**: Streamlines the policy choices to match common physical cash and fee collection denominations (Rs. 10, Rs. 20, Rs. 50) used across schools in Pakistan, removing redundant intermediate values (5) and large steps (100).

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Navigating to Policy Settings**:
   - The user opens **Settings** and navigates to the **Policies & Rules** tab.
   - Under the **Round Transport Fee Up to Nearest Multiple** card, the user clicks the preset dropdown icon or focuses the input field.
2. **Selecting a Preset**:
   - The dropdown displays the updated list of options:
     - `Exact (1)` – "Exact transport fare (no round up)"
     - `Rs. 10` – "Round up transport fare to nearest Rs. 10"
     - `Rs. 20` – "Round up transport fare to nearest Rs. 20"
     - `Rs. 50` – "Round up transport fare to nearest Rs. 50"
   - Selecting any option updates the input value and highlights the active selection with an amber checkmark.
3. **Saving Changes**:
   - The floating or bottom save bar indicates policy changes have been made.
   - Clicking **Save Changes** persists the new `transportRoundingMultiple` to institute settings.
4. **Transport Fare Calculation**:
   - Prorated and standard bus stop fares in the Transport view and generated fee vouchers will round up to the chosen multiple (e.g., a prorated fare of Rs. 1,234 rounds to Rs. 1,240 with step 10, Rs. 1,240 with step 20, or Rs. 1,250 with step 50).

#### Visual Styling
- Uses existing Tailwind design tokens: amber accent theme (`bg-amber-50`, `text-amber-800`, `border-amber-200`) consistent with transport policy controls.
- Dropdown menu maintains clean typography, subtle hover states, and smooth slide/fade animations.

---

### 3. Key Product Decisions & Trade-Offs

- **Standardization with Voucher Rounding**:
  - *Chosen Approach*: Align `TRANSPORT_ROUNDING_PRESETS` with `ROUNDING_QUICK_PRESETS` (`[1, 10, 20, 50]`).
  - *Why*: Eliminates clutter from unused denominations (Rs. 5 and Rs. 100) and introduces Rs. 20 which is a standard Pakistani currency banknote.
  - *Alternatives Considered*: Keeping 5 and 100 as well; rejected because the user specifically requested the steps to be 1, 10, 20, 50.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### System Architecture & Flow

```
┌────────────────────────────────────────────────────────┐
│             SettingsView / PoliciesPanel               │
│  TRANSPORT_ROUNDING_PRESETS: [1, 10, 20, 50]           │
└───────────────────────────┬────────────────────────────┘
                            │ user selects preset (e.g. 20)
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Institute Settings                    │
│        transportRoundingMultiple: 20                   │
└───────────────────────────┬────────────────────────────┘
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
┌─────────────────────────────┐ ┌────────────────────────┐
│        TransportView        │ │      VouchersView      │
│  calculateTransportFee(...) │ │  Preview & Generation  │
│  roundUpToMultiple(fare, 20)│ │  roundUpToMultiple(20) │
└─────────────────────────────┘ └────────────────────────┘
```

#### Files to be Updated

1. **`src/components/settings/PoliciesPanel.tsx`**:
   - Update `TRANSPORT_ROUNDING_PRESETS` array to:
     ```typescript
     const TRANSPORT_ROUNDING_PRESETS: { value: number; label: string; description?: string }[] = [
       { value: 1, label: 'Exact (1)', description: 'Exact transport fare (no round up)' },
       { value: 10, label: '10', description: 'Round up transport fare to nearest Rs. 10' },
       { value: 20, label: '20', description: 'Round up transport fare to nearest Rs. 20' },
       { value: 50, label: '50', description: 'Round up transport fare to nearest Rs. 50' },
     ];
     ```
2. **Verification & Testing**:
   - Verify build and TypeScript compilation with `compile_applet` and `lint_applet`.
   - Confirm dropdown options and fare calculation logic function smoothly.
