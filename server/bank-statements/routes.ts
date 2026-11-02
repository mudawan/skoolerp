// HTTP routes of the Bank Statement Collections Loader, mounted under /api/bank-statements.
// Every route needs 'fees.collect' (the same permission as taking a payment) and is institution-scoped.

import type express from 'express';
import { dbService } from '../db';
import { receivePayments } from '../collections-core';
import { isPermissionAllowed } from '../../src/utils/permissions';
import { ensureBankStatementSchema } from './schema';
import { listAdapters } from './adapters/registry';
import {
  HttpError,
  applyAssigned,
  assignStudent,
  createUpload,
  deleteUpload,
  getUpload,
  getUploadFile,
  ignoreTransaction,
  listTransactions,
  listUploads,
  previewApply,
  reopenTransaction,
  setPaymentMode,
  suggestionsForTransaction,
  suggestionsForUpload,
  unassignStudent,
  unignoreTransaction,
  updateTxSplit,
  type Actor,
  type ServiceDeps,
  type TxFilter,
} from './service';

export interface BankStatementRouteDeps {
  requireAuth: (permission?: string) => express.RequestHandler;
  recordAuditInTx: (req: any, entry: any, client: any) => Promise<void>;
  recordAudit: (req: any, entry: any) => Promise<void>;
  broadcastEvent: (event: any, institutionId?: string) => void;
}


export async function registerBankStatementRoutes(app: express.Express, d: BankStatementRouteDeps): Promise<void> {
  await dbService.init();
  await dbService.withTx(async (client) => {
    await ensureBankStatementSchema(client);
  });

  const pool = (dbService as any).pgPool as { query: (t: string, p?: any[]) => Promise<any> };
  const baseDeps: ServiceDeps = {
    pool,
    withTx: (fn) => dbService.withTx(fn as any),
    searchStudentIds: async (institutionId, q, limit) => {
      const { students } = await dbService.searchStudents(institutionId, { q, page: 1, pageSize: limit });
      return students.map((s: any) => s.id as string);
    },
  };

  const actorOf = (req: any): Actor => ({ id: req.user?.id, name: req.user?.full_name || req.user?.username || 'Unknown', username: req.user?.username });

  const wrap =
    (fn: (req: any, res: express.Response) => Promise<void>): express.RequestHandler =>
    async (req, res) => {
      try {
        await fn(req, res);
      } catch (err: any) {
        const status = err?.httpStatus || 500;
        if (status >= 500) console.error('[BankStatements] request failed:', err);
        res.status(status).json({ success: false, error: status >= 500 && !err?.httpStatus ? 'The request could not be completed.' : err?.message });
      }
    };

  const auth = d.requireAuth('fees.collect');
  const inst = (req: any) => req.institutionId as string;
  const userCtx = (req: any) => ({ role: req.user?.role as any, permissions: req.user?.permissions });

  app.get('/api/bank-statements/adapters', auth, (_req, res) => {
    res.json({ success: true, adapters: listAdapters().map((a) => ({ id: a.id, version: a.version, label: a.label, formats: a.formats })) });
  });

  app.post(
    '/api/bank-statements/uploads',
    auth,
    wrap(async (req, res) => {
      const { filename, mimeType, contentBase64, feeMonth, adapterId } = req.body || {};
      if (typeof contentBase64 !== 'string' || !contentBase64) throw new HttpError(400, 'No file content was received.');
      const upload = await createUpload(baseDeps, inst(req), actorOf(req), {
        filename: String(filename || 'statement'),
        mimeType: typeof mimeType === 'string' ? mimeType : undefined,
        buffer: Buffer.from(contentBase64, 'base64'),
        feeMonth: String(feeMonth || ''),
        adapterId: typeof adapterId === 'string' ? adapterId : undefined,
      });
      await d.recordAudit(req, {
        actionType: upload.parseStatus === 'parsed' ? 'bank_statement_upload' : 'bank_statement_upload_failed',
        actionTitle: upload.parseStatus === 'parsed' ? 'Bank Statement Uploaded' : 'Bank Statement Upload Failed',
        module: 'Collections',
        description: `${upload.filename} for ${upload.feeMonth}: ${upload.newCount} new, ${upload.duplicateCount} already known.`,
        targetId: upload.id,
        targetLabel: upload.filename,
        month: upload.feeMonth,
        metadata: { adapterId: upload.adapterId, totalCredits: upload.totalCredits, error: upload.parseError },
      });
      if (upload.parseStatus === 'failed') {
        res.status(422).json({ success: false, error: upload.parseError || 'The statement could not be read.', upload });
        return;
      }
      res.json({ success: true, upload });
    })
  );

  app.get('/api/bank-statements/uploads', auth, wrap(async (req, res) => {
    res.json({ success: true, uploads: await listUploads(pool, inst(req)) });
  }));

  app.get('/api/bank-statements/uploads/:id', auth, wrap(async (req, res) => {
    res.json({ success: true, upload: await getUpload(pool, inst(req), req.params.id) });
  }));

  // What deleting this statement would do (reversal included), computed by the same code as the delete and rolled back.
  app.get('/api/bank-statements/uploads/:id/delete-preview', auth, wrap(async (req, res) => {
    const deps: ServiceDeps = { ...baseDeps, runVoucherTransaction: (i, scope, m) => dbService.runVoucherTransaction(i, scope as any, m as any) };
    const plan = await deleteUpload(deps, inst(req), req.params.id, { dryRun: true });
    res.json({ success: true, plan, canReverse: isPermissionAllowed(userCtx(req), 'fees.delete') });
  }));

  // Hard delete, "as if never uploaded": reverses what it posted and removes it, all in one database transaction.
  app.delete('/api/bank-statements/uploads/:id', auth, wrap(async (req, res) => {
    const deps: ServiceDeps = {
      ...baseDeps,
      runVoucherTransaction: (i, scope, m) => dbService.runVoucherTransaction(i, scope as any, m as any),
      auditInTx: (client, entry) => d.recordAuditInTx(req, entry, client),
    };
    // Reversing posted payments is a deletion in the fee engine, so it needs the same permission as reversing a collection.
    const plan = await deleteUpload(deps, inst(req), req.params.id, { dryRun: true });
    if (plan.paymentsToReverse > 0 && !isPermissionAllowed(userCtx(req), 'fees.delete')) {
      throw new HttpError(403, "This statement has posted payments. Deleting it reverses them, which requires the 'fees.delete' permission.");
    }
    const result = await deleteUpload(deps, inst(req), req.params.id);
    dbService.incrementRevision(inst(req));
    const rev = dbService.getRevisionInfo(inst(req));
    d.broadcastEvent(
      {
        type: 'db_mutation',
        institutionId: inst(req),
        revision: rev.revision,
        originClientId: (req.headers['x-client-id'] as string) || '',
        lastModified: rev.lastModified,
      },
      inst(req)
    );
    res.json({ success: true, result, revision: rev.revision });
  }));

  app.get('/api/bank-statements/uploads/:id/file', auth, wrap(async (req, res) => {
    const f = await getUploadFile(pool, inst(req), req.params.id);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${f.filename.replace(/"/g, '')}"`);
    res.send(f.content);
  }));

  app.get('/api/bank-statements/uploads/:id/transactions', auth, wrap(async (req, res) => {
    const status = typeof req.query.status === 'string' ? (req.query.status as TxFilter) : 'open';
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json({ success: true, transactions: await listTransactions(pool, inst(req), req.params.id, { status, q }) });
  }));

  app.get('/api/bank-statements/uploads/:id/suggestions', auth, wrap(async (req, res) => {
    res.json({ success: true, suggestions: await suggestionsForUpload(pool, inst(req), req.params.id) });
  }));

  app.get('/api/bank-statements/transactions/:id/suggestions', auth, wrap(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json({ success: true, suggestions: await suggestionsForTransaction(baseDeps, inst(req), req.params.id, q) });
  }));

  app.put('/api/bank-statements/transactions/:id/assign', auth, wrap(async (req, res) => {
    const studentId = req.body?.studentId;
    if (typeof studentId !== 'string' || !studentId) throw new HttpError(400, 'Choose a student.');
    const split = (req.body?.duesAmount !== undefined && req.body?.fineAmount !== undefined)
      ? { duesAmount: Number(req.body.duesAmount), fineAmount: Number(req.body.fineAmount) }
      : undefined;
    res.json({ success: true, transaction: await assignStudent(baseDeps, inst(req), actorOf(req), req.params.id, studentId, split) });
  }));

  app.patch('/api/bank-statements/transactions/:id/split', auth, wrap(async (req, res) => {
    const { duesAmount, fineAmount } = req.body || {};
    if (duesAmount === undefined || fineAmount === undefined) throw new HttpError(400, 'Both duesAmount and fineAmount are required.');
    res.json({
      success: true,
      transaction: await updateTxSplit(baseDeps, inst(req), actorOf(req), req.params.id, Number(duesAmount), Number(fineAmount)),
    });
  }));

  app.patch('/api/bank-statements/transactions/:id/payment-mode', auth, wrap(async (req, res) => {
    const mode = req.body?.paymentMode;
    if (typeof mode !== 'string') throw new HttpError(400, 'paymentMode is required.');
    res.json({ success: true, transaction: await setPaymentMode(baseDeps, inst(req), actorOf(req), req.params.id, mode) });
  }));

  app.delete('/api/bank-statements/transactions/:id/assign', auth, wrap(async (req, res) => {
    res.json({ success: true, transaction: await unassignStudent(baseDeps, inst(req), actorOf(req), req.params.id) });
  }));

  app.post('/api/bank-statements/transactions/:id/ignore', auth, wrap(async (req, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    res.json({ success: true, transaction: await ignoreTransaction(baseDeps, inst(req), actorOf(req), req.params.id, reason) });
  }));

  app.post('/api/bank-statements/transactions/:id/unignore', auth, wrap(async (req, res) => {
    res.json({ success: true, transaction: await unignoreTransaction(baseDeps, inst(req), actorOf(req), req.params.id) });
  }));

  app.post('/api/bank-statements/transactions/:id/reopen', auth, wrap(async (req, res) => {
    res.json({ success: true, transaction: await reopenTransaction(baseDeps, inst(req), actorOf(req), req.params.id) });
  }));

  const txIdsOf = (req: any): string[] | undefined =>
    Array.isArray(req.body?.txIds) ? req.body.txIds.filter((x: any) => typeof x === 'string').slice(0, 5000) : undefined;

  app.post('/api/bank-statements/uploads/:id/apply/preview', auth, wrap(async (req, res) => {
    res.json({ success: true, preview: await previewApply(pool, inst(req), req.params.id, txIdsOf(req)) });
  }));

  app.post('/api/bank-statements/uploads/:id/apply', auth, wrap(async (req, res) => {
    const clientId = (req.headers['x-client-id'] as string) || '';
    const deps: ServiceDeps = {
      ...baseDeps,
      receivePayments: receivePayments as any,
      auditInTx: (client, entry) => d.recordAuditInTx(req, entry, client),
    };
    const result = await applyAssigned(deps, inst(req), actorOf(req), req.params.id, {
      txIds: txIdsOf(req),
    });
    dbService.incrementRevision(inst(req));
    const rev = dbService.getRevisionInfo(inst(req));
    d.broadcastEvent(
      {
        type: 'payment_collected',
        institutionId: inst(req),
        collectionNo: result.collectionNo,
        totalAmount: result.totalAmount,
        transactionCount: result.appliedCount,
        revision: rev.revision,
        originClientId: clientId,
        lastModified: rev.lastModified,
      },
      inst(req)
    );
    res.json({ success: true, result, revision: rev.revision });
  }));
}
