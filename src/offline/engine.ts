import { HttpError, OfflineError } from '../api/errors';
import type { QueueEntry, QueuedOperation } from './types';

/**
 * Motor de sincronização (puro: não conhece SQLite nem React, para ser testado em Node).
 *
 * Regras:
 * - a ordem é por fase dentro da fila (início/reabertura → respostas → NCs → fotos → envio),
 *   preservando a ordem de criação dentro de cada fase. Assim a foto tirada antes da resposta
 *   ainda encontra a resposta no servidor, e o envio só sai depois de tudo o que ele valida;
 * - operações estruturadas vão em lote para `POST /mobile/sync/push` com o `operationId`
 *   do aparelho: o reenvio de algo já aplicado volta `ALREADY_APPLIED`, sem duplicar;
 * - fotos vão uma a uma pelo upload idempotente (mesmo `operationId`);
 * - falha de rede/5xx é transitória: para tudo, mantém a ordem e tenta de novo depois;
 * - recusa do servidor vira `conflict`: a operação fica guardada e as próximas da mesma
 *   inspeção não são enviadas até o técnico resolver.
 */

export interface PushOperation {
  operationId: string;
  type: string;
  entityId: string;
  payload: unknown;
  attempt: number;
}

export interface PushResult {
  operationId: string;
  status: 'APPLIED' | 'ALREADY_APPLIED' | 'REJECTED' | 'CONFLICT' | 'DEPENDENCY_FAILED';
  code: string | null;
}

export interface SyncTransport {
  push(deviceId: string, operations: PushOperation[]): Promise<PushResult[]>;
  uploadEvidence(entry: QueueEntry): Promise<void>;
}

export interface OutboxStore {
  /** Entradas do usuário atual, em ordem de criação. */
  list(): Promise<QueueEntry[]>;
  remove(id: string): Promise<void>;
  markTransient(id: string, message: string): Promise<void>;
  markConflict(id: string, code: string, message: string): Promise<void>;
}

export interface SyncReport {
  sent: number;
  conflicts: number;
  /** Preenchido quando a rodada parou por falha transitória; a fila continua intacta. */
  transientError: string | null;
}

const PHASE: Record<QueuedOperation['kind'], number> = {
  start: 0,
  reopen: 0,
  answer: 1,
  nonConformity: 2,
  evidence: 3,
  submit: 4,
};

export const MAX_BATCH = 50;

/** Ordena por fase mantendo a ordem de criação dentro de cada fase (sort estável). */
export function sortForSync(entries: QueueEntry[]): QueueEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => PHASE[a.entry.operation.kind] - PHASE[b.entry.operation.kind] || a.index - b.index)
    .map(({ entry }) => entry);
}

export function toPushOperation(entry: QueueEntry): PushOperation {
  const op = entry.operation;
  const attempt = Math.min(entry.attempts + 1, 5);
  const base = { operationId: entry.id, entityId: op.inspectionId, attempt };
  switch (op.kind) {
    case 'start':
      return { ...base, type: 'INSPECTION_START', payload: {} };
    case 'reopen':
      return { ...base, type: 'INSPECTION_REOPEN_CORRECTION', payload: {} };
    case 'submit':
      return { ...base, type: 'INSPECTION_SUBMIT', payload: {} };
    case 'answer':
      return { ...base, type: 'ANSWER_UPSERT', payload: op.answer };
    case 'nonConformity':
      return { ...base, type: 'NON_CONFORMITY_CREATE', payload: op.body };
    case 'evidence':
      throw new Error('Evidências não passam pelo push: usam o upload idempotente.');
  }
}

/** 401 sem renovação, 408 e 429 também são transitórios: a operação continua válida. */
export function isTransient(error: unknown): boolean {
  if (error instanceof OfflineError) return true;
  if (error instanceof HttpError) {
    return error.status >= 500 || error.status === 401 || error.status === 408 || error.status === 429;
  }
  return true;
}

const MESSAGES: Record<string, string> = {
  INSPECTION_LOCKED: 'A inspeção não está mais em execução (foi enviada, cancelada ou aprovada).',
  INVALID_TRANSITION: 'O estado da inspeção mudou no servidor.',
  INVALID_STATE: 'O estado da inspeção mudou no servidor.',
  VERSION_CONFLICT: 'Esta inspeção foi alterada em outro local. Revise as alterações antes de continuar.',
  FORBIDDEN_SCOPE: 'Esta inspeção não está mais atribuída a você.',
  OBJECT_NOT_FOUND: 'O registro não existe mais no servidor.',
  REQUIRED_ITEM_MISSING: 'Há itens obrigatórios sem resposta.',
  OBSERVATION_REQUIRED: 'Um item reprovado exige observação.',
  EVIDENCE_REQUIRED: 'Um item reprovado ou NC crítica exige foto.',
  DESCRIPTION_REQUIRED: 'NC crítica exige descrição.',
  EVIDENCE_LIMIT_EXCEEDED: 'A inspeção já tem o máximo de 10 fotos.',
  REQUIRED_FIELD_MISSING: 'Faltam campos obrigatórios.',
  INVALID_RESPONSE_TYPE: 'A resposta não combina com o tipo do item.',
};

export function conflictMessage(code: string | null | undefined, fallback?: string): string {
  return (code && MESSAGES[code]) || fallback || 'O servidor recusou esta operação.';
}

function errorCode(error: unknown): string {
  if (error instanceof HttpError) return error.body?.code ?? `HTTP_${error.status}`;
  return 'UNKNOWN';
}

function errorText(error: unknown): string {
  if (error instanceof OfflineError) return 'Sem conexão com o servidor.';
  if (error instanceof Error) return error.message;
  return 'Falha desconhecida.';
}

export async function runSync(store: OutboxStore, transport: SyncTransport, deviceId: string): Promise<SyncReport> {
  const report: SyncReport = { sent: 0, conflicts: 0, transientError: null };
  const all = sortForSync(await store.list());

  // Conflito em aberto segura o resto da inspeção: enviar o "envio" por cima de uma
  // resposta recusada faria o supervisor receber algo diferente do que o técnico fez.
  const blocked = new Set(all.filter((e) => e.state === 'conflict').map((e) => e.operation.inspectionId));
  const queue = all.filter((e) => e.state === 'pending');

  const conflict = async (entry: QueueEntry, code: string, message: string) => {
    await store.markConflict(entry.id, code, message);
    blocked.add(entry.operation.inspectionId);
    report.conflicts += 1;
  };

  let i = 0;
  while (i < queue.length) {
    const entry = queue[i];
    if (blocked.has(entry.operation.inspectionId)) {
      i += 1;
      continue;
    }

    if (entry.operation.kind === 'evidence') {
      try {
        await transport.uploadEvidence(entry);
        await store.remove(entry.id);
        report.sent += 1;
      } catch (error) {
        if (isTransient(error)) {
          await store.markTransient(entry.id, errorText(error));
          report.transientError = errorText(error);
          return report;
        }
        const code = errorCode(error);
        await conflict(entry, code, conflictMessage(code, errorText(error)));
      }
      i += 1;
      continue;
    }

    // Lote de operações estruturadas. O envio da inspeção vai sempre sozinho, depois do
    // resultado de tudo o que veio antes dele.
    const batch: QueueEntry[] = [];
    if (entry.operation.kind === 'submit') {
      batch.push(entry);
      i += 1;
    } else {
      while (
        i < queue.length &&
        batch.length < MAX_BATCH &&
        queue[i].operation.kind !== 'evidence' &&
        queue[i].operation.kind !== 'submit'
      ) {
        if (!blocked.has(queue[i].operation.inspectionId)) batch.push(queue[i]);
        i += 1;
      }
    }
    if (batch.length === 0) continue;

    let results: PushResult[];
    try {
      results = await transport.push(deviceId, batch.map(toPushOperation));
    } catch (error) {
      if (isTransient(error)) {
        await store.markTransient(batch[0].id, errorText(error));
        report.transientError = errorText(error);
        return report;
      }
      const code = errorCode(error);
      for (const item of batch) await conflict(item, code, conflictMessage(code, errorText(error)));
      continue;
    }

    const byId = new Map(results.map((r) => [r.operationId, r]));
    for (const item of batch) {
      const result = byId.get(item.id);
      if (!result || result.status === 'DEPENDENCY_FAILED') continue; // fica para a próxima rodada
      if (result.status === 'APPLIED' || result.status === 'ALREADY_APPLIED') {
        await store.remove(item.id);
        report.sent += 1;
        continue;
      }
      // Início recusado porque a inspeção já está em andamento: o objetivo já foi atingido.
      if (item.operation.kind === 'start' && result.code === 'INVALID_TRANSITION') {
        await store.remove(item.id);
        continue;
      }
      await conflict(item, result.code ?? result.status, conflictMessage(result.code));
    }
  }
  return report;
}

/** Espera antes da próxima tentativa automática: 1s, 2s, 4s, 8s, 16s com até 25% de jitter. */
export function backoffDelay(failures: number, random: () => number = Math.random): number {
  const base = 1000 * 2 ** Math.min(Math.max(failures - 1, 0), 4);
  return Math.round(base * (1 + random() * 0.25));
}

export const MAX_AUTOMATIC_RETRIES = 5;
