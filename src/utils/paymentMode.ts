// Single source of truth for payment modes (shared by client and server).
// Cheques are deposited to the school account, so they are recorded as BankDeposit.

export const PAYMENT_MODES = ['SchoolCashier', 'BankDeposit', 'OnlineTransfer'] as const;

export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const DEFAULT_PAYMENT_MODE: PaymentMode = 'BankDeposit';

export const PAYMENT_MODE_OPTIONS: readonly PaymentMode[] = PAYMENT_MODES;

export const isPaymentMode = (value: unknown): value is PaymentMode =>
  typeof value === 'string' && (PAYMENT_MODES as readonly string[]).includes(value);

/** Display text derived from the value: "BankDeposit" -> "Bank Deposit". */
export const paymentModeText = (mode?: string): string =>
  mode ? mode.replace(/([a-z])([A-Z])/g, '$1 $2') : '';

/** True when the money goes through the school account (bank details apply on receipts). */
export const isBankedMode = (mode?: string): boolean => mode !== 'SchoolCashier';

/**
 * Parses CSV/user input into a PaymentMode. Matches the three mode names only,
 * ignoring case, spaces, hyphens and underscores. Returns undefined if not recognised.
 */
export const normalizePaymentMode = (input?: string): PaymentMode | undefined => {
  if (!input) return undefined;
  const key = input.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return PAYMENT_MODES.find((m) => m.toLowerCase() === key);
};
