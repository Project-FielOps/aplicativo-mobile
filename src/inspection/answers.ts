import type { AnswerUpsertRequest, ItemSnapshot } from '../api/types';

/** `optionsJson` trafega como string JSON, ex.: '["A","B"]'. */
export function parseOptions(optionsJson: string | null | undefined): string[] {
  if (!optionsJson) return [];
  try {
    const parsed = JSON.parse(optionsJson);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export interface NumberRules {
  min?: number;
  max?: number;
  unit?: string;
}

/**
 * `rulesJson` é carregado pela API mas o construtor de modelos ainda não define
 * um schema, então lemos de forma tolerante: se vierem `min`/`max`/`unit`,
 * mostramos a faixa-alvo do protótipo; se não, o campo é um número simples.
 */
export function parseRules(rulesJson: string | null | undefined): NumberRules {
  if (!rulesJson) return {};
  try {
    const parsed = JSON.parse(rulesJson) as Record<string, unknown>;
    const rules: NumberRules = {};
    if (typeof parsed.min === 'number') rules.min = parsed.min;
    if (typeof parsed.max === 'number') rules.max = parsed.max;
    if (typeof parsed.unit === 'string') rules.unit = parsed.unit;
    return rules;
  } catch {
    return {};
  }
}

/**
 * O que o item exige quando reprovado. Mora no mesmo `rulesJson`, e é o que a
 * API valida no envio (`OBSERVATION_REQUIRED` e `EVIDENCE_REQUIRED`).
 */
export function failureRequirements(rulesJson: string | null | undefined): {
  observation: boolean;
  evidence: boolean;
} {
  if (!rulesJson) return { observation: false, evidence: false };
  try {
    const parsed = JSON.parse(rulesJson) as Record<string, unknown>;
    return {
      observation: parsed.observationRequiredOnFailure === true,
      evidence: parsed.evidenceRequiredOnFailure === true,
    };
  } catch {
    return { observation: false, evidence: false };
  }
}

/** Estado corrente do item: o rascunho local vence a resposta já no servidor. */
export function currentAnswer(
  item: ItemSnapshot,
  draft: AnswerUpsertRequest | undefined,
): AnswerUpsertRequest {
  if (draft) return draft;
  const a = item.answer;
  return {
    inspectionItemId: item.id,
    valueText: a?.valueText ?? null,
    valueNumber: a?.valueNumber ?? null,
    valueBoolean: a?.valueBoolean ?? null,
    valueDate: a?.valueDate ?? null,
    valueJson: a?.valueJson ?? null,
    observation: a?.observation ?? null,
    conformity: a?.conformity ?? null,
  };
}

/** Um item conta como respondido quando tem valor para o seu tipo. */
export function isAnswered(item: ItemSnapshot, answer: AnswerUpsertRequest): boolean {
  switch (item.responseType) {
    case 'CONFORMITY':
      return answer.conformity != null;
    case 'NUMBER':
      return answer.valueNumber != null;
    case 'BOOLEAN':
      return answer.valueBoolean != null;
    case 'DATE':
      return Boolean(answer.valueDate);
    case 'TEXT_SHORT':
    case 'TEXT_LONG':
    case 'SINGLE_CHOICE':
      return Boolean(answer.valueText && answer.valueText.trim());
  }
}

export interface Section {
  title: string;
  description: string | null;
  order: number;
  items: ItemSnapshot[];
}

/** Agrupa o snapshot plano em seções, preservando a ordem do modelo. */
export function groupSections(items: ItemSnapshot[]): Section[] {
  const map = new Map<string, Section>();

  for (const item of items) {
    const key = `${item.sectionOrder}::${item.sectionTitle}`;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(key, {
        title: item.sectionTitle,
        description: item.sectionDescription,
        order: item.sectionOrder,
        items: [item],
      });
    }
  }

  const sections = [...map.values()].sort((a, b) => a.order - b.order);
  sections.forEach((s) => s.items.sort((a, b) => a.itemOrder - b.itemOrder));
  return sections;
}

/**
 * Regras de bloqueio de envio, espelhando o que o backend valida — melhor o
 * técnico descobrir aqui, ainda no ativo, do que levar 422 depois de sair.
 */
export function blockingIssues(
  items: ItemSnapshot[],
  drafts: Record<string, AnswerUpsertRequest>,
  /** Quantas evidências o item já tem, somando as que ainda estão na fila. */
  evidenceCount?: (itemId: string) => number,
): { item: ItemSnapshot; reason: string }[] {
  const issues: { item: ItemSnapshot; reason: string }[] = [];

  for (const item of items) {
    const answer = currentAnswer(item, drafts[item.id]);
    const answered = isAnswered(item, answer);

    if (item.required && !answered) {
      issues.push({ item, reason: 'Item obrigatório sem resposta' });
      continue;
    }

    if (answer.conformity !== 'NON_CONFORMING') continue;

    const requires = failureRequirements(item.rulesJson);

    if (!answer.observation?.trim()) {
      issues.push({ item, reason: 'Não conformidade exige observação' });
    }

    // O servidor recusa o envio sem evidência (EVIDENCE_REQUIRED); descobrir
    // aqui evita a viagem perdida de voltar ao ativo para tirar a foto.
    if (requires.evidence && evidenceCount && evidenceCount(item.id) === 0) {
      issues.push({ item, reason: 'Não conformidade exige foto de evidência' });
    }
  }

  return issues;
}
