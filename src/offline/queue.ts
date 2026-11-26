import { getDatabase } from './database';
import type { OutboxStore } from './engine';
import { session } from './session';
import type { QueueEntry, QueuedOperation } from './types';

export type { QueueEntry, QueuedOperation } from './types';

export function describeOperation(op: QueuedOperation): string { switch (op.kind) { case 'start': return 'Início de inspeção'; case 'reopen': return 'Reabertura para correção'; case 'answer': return 'Resposta do checklist'; case 'evidence': return 'Evidência fotográfica'; case 'nonConformity': return 'Não conformidade'; case 'submit': return 'Envio da inspeção'; } }
export function operationIcon(op: QueuedOperation): string { switch (op.kind) { case 'start': return 'play-circle-outline'; case 'reopen': return 'refresh-outline'; case 'answer': return 'checkbox-outline'; case 'evidence': return 'camera-outline'; case 'nonConformity': return 'warning-outline'; case 'submit': return 'cloud-upload-outline'; } }

type Row = { id: string; user_id: string | null; operation: string; created_at: string; attempts: number; last_error: string | null; state: string; last_code: string | null };

const toEntry = (row: Row): QueueEntry => ({ id: row.id, userId: row.user_id ?? '', operation: JSON.parse(row.operation) as QueuedOperation, createdAt: row.created_at, attempts: row.attempts, state: row.state === 'conflict' ? 'conflict' : 'pending', lastError: row.last_error ?? undefined, lastCode: row.last_code ?? undefined });

/** Outbox persistente no SQLite, isolada por usuário. Sobrevive a reinício e a falhas parciais. */
export const queue: OutboxStore & {
  enqueue(id: string, operation: QueuedOperation): Promise<QueueEntry | null>;
  retry(id: string): Promise<void>;
  countForOtherUsers(): Promise<number>;
} = {
  async list() {
    const userId = session.userId;
    if (!userId) return [];
    const db = await getDatabase();
    // Filas antigas sem dono (versão anterior do app) passam a ser do primeiro técnico a entrar.
    await db.runAsync('UPDATE sync_queue SET user_id = ? WHERE user_id IS NULL', userId);
    const rows = await db.getAllAsync<Row>('SELECT * FROM sync_queue WHERE user_id = ? ORDER BY created_at, rowid', userId);
    return rows.map(toEntry);
  },
  async enqueue(id, operation) {
    const userId = session.userId;
    if (!userId) return null;
    const db = await getDatabase();
    const entry: QueueEntry = { id, userId, operation, createdAt: new Date().toISOString(), attempts: 0, state: 'pending' };
    await db.withTransactionAsync(async () => {
      if (operation.kind === 'answer') {
        // Só a última versão de cada resposta ainda não enviada precisa subir.
        await db.runAsync("DELETE FROM sync_queue WHERE user_id = ? AND state = 'pending' AND json_extract(operation, '$.kind') = 'answer' AND json_extract(operation, '$.inspectionId') = ? AND json_extract(operation, '$.answer.inspectionItemId') = ?", userId, operation.inspectionId, operation.answer.inspectionItemId);
      }
      await db.runAsync("INSERT INTO sync_queue (id, user_id, operation, created_at, attempts, state) VALUES (?, ?, ?, ?, 0, 'pending')", entry.id, userId, JSON.stringify(operation), entry.createdAt);
    });
    return entry;
  },
  async remove(id) { const db = await getDatabase(); await db.runAsync('DELETE FROM sync_queue WHERE id = ?', id); },
  async markTransient(id, message) { const db = await getDatabase(); await db.runAsync('UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?', message, id); },
  async markConflict(id, code, message) { const db = await getDatabase(); await db.runAsync("UPDATE sync_queue SET state = 'conflict', last_code = ?, last_error = ? WHERE id = ?", code, message, id); },
  async retry(id) { const db = await getDatabase(); await db.runAsync("UPDATE sync_queue SET state = 'pending', last_code = NULL, last_error = NULL WHERE id = ?", id); },
  async countForOtherUsers() { const userId = session.userId; const db = await getDatabase(); const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_queue WHERE user_id IS NOT NULL AND user_id <> ?', userId ?? ''); return row?.n ?? 0; },
};
