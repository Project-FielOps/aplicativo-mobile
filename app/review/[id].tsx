import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  inspections as inspectionsApi,
  nonConformities as ncApi,
  review as reviewApi,
} from '../../src/api/endpoints';
import { useAsync, messageFor } from '../../src/hooks/useAsync';
import { groupSections } from '../../src/inspection/answers';
import { Badge, Button, Card, DataRow, ErrorState, Field, LoadingState } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/Header';
import { conformityTone, formatDateTime, label, priorityTone } from '../../src/labels';
import { colors, radius, semantic, spacing } from '../../src/theme/tokens';
import { type } from '../../src/theme/typography';
import type { AnswerResponse, ItemSnapshot } from '../../src/api/types';

/**
 * Decisão sobre uma inspeção enviada.
 *
 * Mostra o que o técnico respondeu, item a item, e as não conformidades
 * abertas. Aprovar encerra; reprovar exige motivo — o técnico precisa saber o
 * que corrigir, e o motivo fica registrado na auditoria.
 */

/** Como a resposta do técnico aparece para quem revisa. */
function answerText(item: ItemSnapshot, answer: AnswerResponse | null): string {
  if (!answer) return 'Sem resposta';
  switch (item.responseType) {
    case 'BOOLEAN':
      return answer.valueBoolean == null ? 'Sem resposta' : answer.valueBoolean ? 'Sim' : 'Não';
    case 'NUMBER':
      return answer.valueNumber == null ? 'Sem resposta' : String(answer.valueNumber);
    case 'DATE':
      return answer.valueDate ? formatDateTime(answer.valueDate) : 'Sem resposta';
    case 'CONFORMITY':
      return answer.conformity ? label(answer.conformity) : 'Sem resposta';
    default:
      return answer.valueText?.trim() || 'Sem resposta';
  }
}

export default function ReviewDecisionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const load = useCallback(async () => {
    const [inspection, ncs] = await Promise.all([
      inspectionsApi.get(id),
      ncApi.list(id).catch(() => []),
    ]);
    return { inspection, ncs };
  }, [id]);

  const { data, loading, error, reload } = useAsync(load, [id]);

  const [mode, setMode] = useState<'idle' | 'approving' | 'rejecting'>('idle');
  const [comments, setComments] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<'APPROVED' | 'REJECTED' | null>(null);

  const inspection = data?.inspection ?? null;
  const decided = inspection ? ['APPROVED', 'REJECTED'].includes(inspection.status) : false;

  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    if (saving || !inspection) return;
    if (decision === 'REJECTED' && !reason.trim()) {
      setActionError('Informe o motivo da reprovação.');
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      // A API exige passar por UNDER_REVIEW antes de decidir; se outro
      // supervisor já abriu, o begin falha e seguimos para a decisão.
      if (inspection.status === 'SUBMITTED') {
        await reviewApi.begin(inspection.id).catch(() => undefined);
      }
      if (decision === 'APPROVED') {
        await reviewApi.approve(inspection.id, comments);
      } else {
        await reviewApi.reject(inspection.id, reason.trim(), comments);
      }
      setDone(decision);
    } catch (e) {
      setActionError(messageFor(e).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Revisão" onBack={() => router.back()} />
        <LoadingState />
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Revisão" onBack={() => router.back()} />
        <View style={styles.centered}>
          <ErrorState message={error} onRetry={reload} />
        </View>
      </SafeAreaView>
    );
  }

  if (!inspection) return null;

  // --- Decidida ------------------------------------------------------------
  if (done) {
    const approved = done === 'APPROVED';
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Revisão" onBack={() => router.back()} />
        <View style={styles.centered}>
          <Card accent={approved ? semantic.success.fg : semantic.danger.fg}>
            <View style={styles.rowStart}>
              <Ionicons
                name={approved ? 'checkmark-circle' : 'close-circle'}
                size={22}
                color={approved ? semantic.success.fg : semantic.danger.fg}
              />
              <Text style={[type.titleMd, { flex: 1 }]}>
                {approved ? 'Inspeção aprovada' : 'Inspeção reprovada'}
              </Text>
            </View>
            <Text style={[type.headlineSm, { marginTop: spacing.xs }]}>{inspection.title}</Text>
            <Text style={[type.bodyMd, styles.muted, { marginTop: spacing.xs }]}>
              {approved
                ? 'O ciclo está encerrado e a inspeção sai da fila de revisão.'
                : `Voltou para a agenda de ${inspection.technicianName ?? 'do técnico'} com o motivo registrado.`}
            </Text>
            <Button
              title="Voltar para a fila"
              icon="arrow-back"
              onPress={() => router.replace('/review')}
              style={{ marginTop: spacing.md }}
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  const sections = groupSections(inspection.items ?? []);
  const answered = (inspection.items ?? []).filter((i) => i.answer).length;
  const total = (inspection.items ?? []).length;
  const ncs = data?.ncs ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title="Revisar Inspeção"
        subtitle={inspection.technicianName ?? undefined}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Cabeçalho */}
        <Card accent={priorityTone(inspection.priority) === 'danger' ? semantic.danger.fg : colors.primary}>
          <View style={styles.badges}>
            <Badge tone={priorityTone(inspection.priority)}>{label(inspection.priority)}</Badge>
            <Badge tone="info">{label(inspection.status)}</Badge>
          </View>
          <Text style={[type.headlineSm, { marginTop: spacing.xs }]}>{inspection.title}</Text>

          <View style={styles.dataStrip}>
            <DataRow label="Técnico" value={inspection.technicianName} />
            <DataRow label="Ativo" value={inspection.equipmentName} />
            <DataRow label="Local" value={inspection.siteName} />
            <DataRow label="Enviada" value={formatDateTime(inspection.submittedAtServer)} />
          </View>

          <Text style={[type.bodyMd, styles.muted]}>
            {answered} de {total} itens respondidos
          </Text>
        </Card>

        {/* Não conformidades */}
        {ncs.length > 0 ? (
          <Card accent={semantic.danger.fg}>
            <View style={styles.rowStart}>
              <Ionicons name="warning-outline" size={20} color={semantic.danger.fg} />
              <Text style={[type.titleMd, { flex: 1 }]}>
                {ncs.length} não {ncs.length === 1 ? 'conformidade' : 'conformidades'}
              </Text>
            </View>
            {ncs.map((nc) => (
              <View key={nc.id} style={styles.ncRow}>
                <Badge tone={priorityTone(nc.severity)}>{label(nc.severity)}</Badge>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyLg}>{nc.title}</Text>
                  {nc.description ? (
                    <Text style={[type.bodyMd, styles.muted]}>{nc.description}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Respostas do checklist */}
        {sections.map((section) => (
          <Card key={`${section.order}-${section.title}`}>
            <Text style={type.labelCaps}>{section.title}</Text>
            {section.items.map((item, index) => {
              const answer = item.answer;
              const nonConforming = answer?.conformity === 'NON_CONFORMING';
              return (
                <View
                  key={item.id}
                  style={[styles.answerRow, nonConforming && styles.answerRowFlagged]}
                >
                  <Text style={[type.bodyMd, styles.muted]}>
                    {index + 1}. {item.itemTitle}
                    {item.required ? <Text style={{ color: semantic.danger.fg }}> *</Text> : null}
                  </Text>

                  <View style={styles.answerValue}>
                    {answer?.conformity ? (
                      <Badge tone={conformityTone(answer.conformity)}>
                        {label(answer.conformity)}
                      </Badge>
                    ) : (
                      <Text style={type.bodyLg}>{answerText(item, answer)}</Text>
                    )}
                    {answer?.conformity && item.responseType !== 'CONFORMITY' ? (
                      <Text style={type.bodyLg}>{answerText(item, answer)}</Text>
                    ) : null}
                  </View>

                  {answer?.observation ? (
                    <View style={styles.observation}>
                      <Ionicons
                        name="chatbox-ellipses-outline"
                        size={14}
                        color={colors.onSurfaceVariant}
                      />
                      <Text style={[type.bodyMd, styles.muted, { flex: 1 }]}>
                        {answer.observation}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>
        ))}

        {/* Decisão */}
        {decided ? (
          <Card>
            <Text style={[type.bodyMd, styles.muted]}>
              Esta inspeção já foi {label(inspection.status).toLowerCase()} e não aceita nova
              decisão.
            </Text>
          </Card>
        ) : (
          <Card>
            <Text style={type.labelCaps}>Decisão</Text>

            {mode === 'rejecting' ? (
              <Field
                label="Motivo da reprovação"
                placeholder="O que precisa ser refeito em campo"
                value={reason}
                onChangeText={setReason}
                multiline
                style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.sm }}
              />
            ) : null}

            <Field
              label="Comentários (opcional)"
              placeholder="Observações para o histórico"
              value={comments}
              onChangeText={setComments}
              multiline
              style={{ minHeight: 72, textAlignVertical: 'top', paddingTop: spacing.sm }}
            />

            {actionError ? (
              <View style={styles.error}>
                <Ionicons name="alert-circle-outline" size={18} color={semantic.danger.fg} />
                <Text style={[type.bodyMd, { color: semantic.danger.fg, flex: 1 }]}>
                  {actionError}
                </Text>
              </View>
            ) : null}

            <View style={{ gap: spacing.xs }}>
              {mode === 'rejecting' ? (
                <>
                  <Button
                    title="Confirmar reprovação"
                    icon="close-circle-outline"
                    variant="danger"
                    loading={saving}
                    onPress={() => void decide('REJECTED')}
                  />
                  <Button
                    title="Cancelar"
                    variant="ghost"
                    onPress={() => {
                      setMode('idle');
                      setActionError(null);
                    }}
                  />
                </>
              ) : (
                <>
                  <Button
                    title="Aprovar inspeção"
                    icon="checkmark-circle-outline"
                    loading={saving}
                    onPress={() => void decide('APPROVED')}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setMode('rejecting')}
                    style={({ pressed }) => [styles.rejectLink, pressed && { opacity: 0.8 }]}
                  >
                    <Ionicons name="close-circle-outline" size={18} color={semantic.danger.fg} />
                    <Text style={[type.bodyMdMedium, { color: semantic.danger.fg }]}>
                      Reprovar e devolver ao técnico
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.gutter, gap: spacing.md, paddingBottom: spacing.xl },
  centered: { flex: 1, justifyContent: 'center', padding: spacing.gutter },
  muted: { color: colors.onSurfaceVariant },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  dataStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    marginVertical: spacing.sm,
  },
  ncRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  answerRow: {
    gap: 4,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  answerRowFlagged: {
    backgroundColor: semantic.danger.bg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  answerValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  observation: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 2 },
  rejectLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: semantic.danger.bg,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
});
