import { PaymentMode } from '../types';

export function normalizePaymentMode(raw: string | undefined | null): PaymentMode | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (s === 'cash') return 'Cash';
  if (s === 'banktransfer' || s === 'bank' || s === 'transfer' || s === 'ibft') return 'BankTransfer';
  if (s === 'cheque' || s === 'check') return 'Cheque';
  if (s === 'online' || s === 'card' || s === 'digital' || s === 'gateway') return 'Online';
  return null;
}
