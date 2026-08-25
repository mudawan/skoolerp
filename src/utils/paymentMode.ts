import { PaymentMode } from '../types';

const PAYMENT_MODE_ALIASES: Record<string, PaymentMode> = {
  cash: 'Cash',
  banktransfer: 'BankTransfer',
  bank: 'BankTransfer',
  bt: 'BankTransfer',
  transfer: 'BankTransfer',
  cheque: 'Cheque',
  check: 'Cheque',
  online: 'Online',
};

export const PAYMENT_MODE_OPTIONS: PaymentMode[] = ['Cash', 'BankTransfer', 'Cheque', 'Online'];

export const normalizePaymentMode = (input?: string): PaymentMode | undefined => {
  if (!input) return undefined;
  const key = input.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return PAYMENT_MODE_ALIASES[key];
};
