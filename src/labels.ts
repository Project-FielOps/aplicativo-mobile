import { semantic, type SemanticTone } from './theme/tokens';
import type { Conformity, InspectionStatus, NonConformitySeverity, Priority, Role } from './api/types';

/**
 * Enums da API traduzidos para a interface. O valor original continua sendo o
 * que trafega para o servidor — isto é só apresentação.
 */

const LABELS: Record<string, string> = {
  // Perfis
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  TECHNICIAN: 'Técnico de Campo',
  CLIENT_VIEWER: 'Cliente',

  // Ciclo de vida da inspeção
  DRAFT: 'Rascunho',
  ASSIGNED: 'Atribuída',
  IN_PROGRESS: 'Em andamento',
  SUBMITTED: 'Enviada',
  UNDER_REVIEW: 'Em revisão',
  APPROVED: 'Aprovada',
  REJECTED: 'Reprovada',
  CANCELED: 'Cancelada',

  // Prioridade e severidade
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',

  // Conformidade
  CONFORMING: 'Conforme',
  NON_CONFORMING: 'Não conforme',
  NOT_APPLICABLE: 'Não aplicável',

  // Situação da não conformidade
  OPEN: 'Aberta',
  RESOLVED: 'Resolvida',
  CLOSED: 'Fechada',

  // Cadastro
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  BLOCKED: 'Bloqueado',
};

export function label(value: string | null | undefined): string {
  if (!value) return '—';
  return LABELS[value] ?? value;
}

/**
 * Cor semântica de cada estado. O azul marca o fluxo normal, o âmbar marca
 * trabalho em curso e o vermelho marca bloqueio — mesma leitura do protótipo.
 */
export function statusTone(status: InspectionStatus): SemanticTone {
  switch (status) {
    case 'IN_PROGRESS':
      return 'warning';
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'CANCELED':
    case 'DRAFT':
      return 'neutral';
    default:
      return 'info';
  }
}

export function priorityTone(priority: Priority | NonConformitySeverity): SemanticTone {
  switch (priority) {
    case 'LOW':
      return 'success';
    case 'MEDIUM':
      return 'warning';
    case 'HIGH':
      return 'high';
    case 'CRITICAL':
      return 'danger';
  }
}

export function conformityTone(conformity: Conformity): SemanticTone {
  switch (conformity) {
    case 'CONFORMING':
      return 'success';
    case 'NON_CONFORMING':
      return 'danger';
    case 'NOT_APPLICABLE':
      return 'neutral';
  }
}

export function roleLabel(role: Role): string {
  return label(role);
}

export function toneColors(tone: SemanticTone) {
  return semantic[tone];
}

/** Data curta em pt-BR, tolerante a nulo. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "há 3 min" — usado no rodapé da tela de sincronização. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return 'nunca';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return formatDate(iso);
}
