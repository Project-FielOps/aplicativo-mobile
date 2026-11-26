/// <reference types="node" />
/**
 * Prova ponta a ponta do offline contra a API real (o mesmo motor que roda no app).
 *
 *   cd ../API && ./scripts/e2e/run-with-api.sh --reset -- npm --prefix ../aplicativo-mobile run test:e2e
 *
 * Roteiro: a web planeja → o técnico trabalha sem rede (tudo vai para a outbox) → a rede cai
 * no meio do envio (resposta perdida) → o app reenvia → o banco principal recebe tudo
 * exatamente uma vez → o supervisor reprova e o técnico descobre pelo pull.
 */
import assert from 'node:assert/strict';
import { HttpError, OfflineError } from '../src/api/errors';
import { runSync, type OutboxStore, type PushResult, type SyncTransport } from '../src/offline/engine';
import { uuid } from '../src/offline/session';
import type { QueueEntry, QueuedOperation } from '../src/offline/types';

const BASE = (process.env.FIELDOPS_API_URL ?? 'http://127.0.0.1:8080/api/v1').replace(/\/+$/, '');
const PASSWORD = process.env.FIELDOPS_E2E_PASSWORD ?? '';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

async function call<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new OfflineError();
  }
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new HttpError(response.status, body, body?.message ?? `HTTP ${response.status}`);
  return body as T;
}
const post = <T>(path: string, token: string, body: unknown = {}) => call<T>(path, token, { method: 'POST', body: JSON.stringify(body) });
const login = async (email: string) => (await call<{ accessToken: string }>('/auth/login', null, { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) })).accessToken;

function store(entries: QueueEntry[]): OutboxStore & { entries: QueueEntry[] } {
  return {
    entries,
    async list() { return [...this.entries]; },
    async remove(id) { this.entries = this.entries.filter((e) => e.id !== id); },
    async markTransient(id, message) { this.entries = this.entries.map((e) => (e.id === id ? { ...e, attempts: e.attempts + 1, lastError: message } : e)); },
    async markConflict(id, code, message) { this.entries = this.entries.map((e) => (e.id === id ? { ...e, state: 'conflict', lastCode: code, lastError: message } : e)); },
  };
}

function realTransport(token: string): SyncTransport {
  return {
    async push(deviceId, operations) {
      const res = await post<{ results: PushResult[] }>('/mobile/sync/push', token, { deviceId, operations });
      return res.results;
    },
    async uploadEvidence(entry) {
      const op = entry.operation;
      if (op.kind !== 'evidence') throw new Error('not evidence');
      const form = new FormData();
      form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), op.photo.name);
      const q = new URLSearchParams({ operationId: entry.id });
      if (op.itemId) q.set('inspectionItemId', op.itemId);
      if (op.nonConformityOperationId) q.set('nonConformityOperationId', op.nonConformityOperationId);
      if (op.latitude != null) q.set('latitude', String(op.latitude));
      if (op.longitude != null) q.set('longitude', String(op.longitude));
      await call(`/inspections/${op.inspectionId}/evidence?${q}`, token, { method: 'POST', body: form });
    },
  };
}

async function main() {
  assert.ok(PASSWORD, 'defina FIELDOPS_E2E_PASSWORD (a senha do seed)');
  const admin = await login('admin@fieldops.local');
  const supervisor = await login('supervisor@fieldops.local');
  const technician = await login('technician@fieldops.local');
  const tech = await call<{ id: string }>('/auth/me', technician);
  const sup = await call<{ id: string }>('/auth/me', supervisor);
  const tag = Date.now().toString(36);

  // 1. Planejamento na web (cadastros, modelo publicado, inspeção atribuída).
  const client = await post<{ id: string }>('/clients', admin, { name: `Cliente offline ${tag}` });
  const site = await post<{ id: string }>(`/clients/${client.id}/sites`, admin, { name: `Planta ${tag}`, latitude: -23.55, longitude: -46.63 });
  const template = await post<{ id: string }>('/inspection-templates', supervisor, { title: `Checklist offline ${tag}`, category: 'Elétrica' });
  const section = await post<{ id: string }>(`/inspection-templates/${template.id}/sections`, supervisor, { title: 'Condição', displayOrder: 1 });
  await post(`/inspection-templates/${template.id}/sections/${section.id}/items`, supervisor, { title: 'Oil level', responseType: 'CONFORMITY', required: true, observationRequiredOnFailure: true, evidenceRequiredOnFailure: true, displayOrder: 1 });
  await post(`/inspection-templates/${template.id}/publish`, supervisor);
  const inspection = await post<{ id: string; items: { id: string }[] }>('/inspections', supervisor, {
    templateId: template.id, clientId: client.id, siteId: site.id, technicianId: tech.id, supervisorId: sup.id,
    title: `Inspeção offline ${tag}`, priority: 'HIGH', scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
  });
  const itemId = inspection.items[0].id;
  const pulled = await call<{ changes: { entityId: string; payload: { event: string } }[]; nextCursor: string }>('/mobile/sync/pull?cursor=0', technician);
  assert.ok(pulled.changes.some((c) => c.entityId === inspection.id && c.payload.event === 'ASSIGNED'), 'atribuição chega pelo pull');
  console.log('✔ planejamento web e atribuição recebida pelo pull');

  // 2. Trabalho em campo sem rede: tudo vai para a outbox.
  let t = 0;
  const entry = (operation: QueuedOperation): QueueEntry => ({ id: uuid(), userId: tech.id, operation, createdAt: new Date(++t).toISOString(), attempts: 0, state: 'pending' });
  const nc = entry({ kind: 'nonConformity', inspectionId: inspection.id, body: { inspectionItemId: itemId, title: 'Vazamento', description: 'Óleo no cárter', severity: 'CRITICAL' } });
  const outbox = store([
    entry({ kind: 'start', inspectionId: inspection.id }),
    entry({ kind: 'evidence', inspectionId: inspection.id, photo: { uri: 'mem', name: 'item.jpg', mimeType: 'image/jpeg' }, itemId, latitude: -23.55, longitude: -46.63 }),
    entry({ kind: 'answer', inspectionId: inspection.id, answer: { inspectionItemId: itemId, conformity: 'NON_CONFORMING', observation: 'Óleo baixo' } }),
    nc,
    entry({ kind: 'evidence', inspectionId: inspection.id, photo: { uri: 'mem', name: 'nc.jpg', mimeType: 'image/jpeg' }, nonConformityOperationId: nc.id }),
    entry({ kind: 'submit', inspectionId: inspection.id }),
  ]);
  const deviceId = uuid();
  const offline: SyncTransport = { push: async () => { throw new OfflineError(); }, uploadEvidence: async () => { throw new OfflineError(); } };
  const r0 = await runSync(outbox, offline, deviceId);
  assert.ok(r0.transientError);
  assert.equal(outbox.entries.length, 6, 'sem rede nada sai da outbox');
  const before = await call<{ status: string }>(`/inspections/${inspection.id}`, supervisor);
  assert.equal(before.status, 'ASSIGNED', 'banco principal ainda não sabe de nada');
  console.log('✔ sem rede: 6 operações guardadas, servidor intacto');

  // 3. A rede volta, mas cai no meio: o servidor aplica o lote e a resposta se perde.
  const real = realTransport(technician);
  let dropped = false;
  const flaky: SyncTransport = {
    async push(id, ops) { const res = await real.push(id, ops); if (!dropped) { dropped = true; throw new OfflineError(); } return res; },
    uploadEvidence: (e) => real.uploadEvidence(e),
  };
  const r1 = await runSync(outbox, flaky, deviceId);
  assert.ok(r1.transientError, 'resposta perdida é tratada como falha transitória');
  assert.equal(outbox.entries.length, 6, 'sem confirmação, nada é removido');

  // 4. Reenvio: o que já foi aplicado volta ALREADY_APPLIED; o restante sobe na ordem certa.
  const r2 = await runSync(outbox, real, deviceId);
  assert.equal(r2.transientError, null, JSON.stringify(outbox.entries));
  assert.equal(r2.conflicts, 0, JSON.stringify(outbox.entries));
  assert.equal(outbox.entries.length, 0);
  // E mais um reenvio completo de tudo (app reiniciado sem ter gravado a confirmação).
  const replay = store(outbox.entries);
  await runSync(replay, real, deviceId);

  const detail = await call<{ status: string; items: { answer: { conformity: string } | null }[] }>(`/inspections/${inspection.id}`, supervisor);
  const evidence = await call<{ responseId: string | null; nonConformityId: string | null; latitude: number | null }[]>(`/inspections/${inspection.id}/evidence`, supervisor);
  const ncs = await call<{ id: string }[]>(`/inspections/${inspection.id}/non-conformities`, supervisor);
  assert.equal(detail.status, 'SUBMITTED');
  assert.equal(detail.items[0].answer?.conformity, 'NON_CONFORMING');
  assert.equal(ncs.length, 1, 'NC criada uma única vez');
  assert.equal(evidence.length, 2, 'cada foto registrada uma única vez');
  assert.ok(evidence.some((e) => e.responseId) && evidence.some((e) => e.nonConformityId === ncs[0].id), 'fotos ligadas ao item e à NC');
  console.log('✔ rede instável: tudo chegou ao banco principal exatamente uma vez (SUBMITTED, 1 NC, 2 fotos com GPS)');

  // 5. Revisão na web e descoberta pelo aparelho.
  await post(`/inspections/${inspection.id}/begin-review`, supervisor);
  await post(`/inspections/${inspection.id}/reject`, supervisor, { reason: 'Foto da NC desfocada' });
  const after = await call<{ changes: { entityId: string; payload: { event: string } }[] }>(`/mobile/sync/pull?cursor=${pulled.nextCursor}`, technician);
  assert.ok(after.changes.some((c) => c.entityId === inspection.id && c.payload.event === 'REJECTED'));
  const reopen = store([entry({ kind: 'reopen', inspectionId: inspection.id })]);
  await runSync(reopen, real, deviceId);
  assert.equal((await call<{ status: string }>(`/inspections/${inspection.id}`, supervisor)).status, 'IN_PROGRESS');
  console.log('✔ reprovação chega pelo pull e a reabertura offline volta a inspeção para correção');
  console.log('\nE2E offline: OK');
}

main().catch((error) => {
  console.error('E2E offline FALHOU:', error);
  process.exit(1);
});
