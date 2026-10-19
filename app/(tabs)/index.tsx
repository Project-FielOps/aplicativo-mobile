import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/AuthContext';
import { useSync } from '../../src/offline/SyncContext';
import { inspections as inspectionsApi } from '../../src/api/endpoints';
import { useAsync } from '../../src/hooks/useAsync';
import { Badge, Button, Card, ErrorState, LoadingState, ProgressBar } from '../../src/components/ui';
import { BrandHeader } from '../../src/components/Header';
import { label, priorityTone, statusTone } from '../../src/labels';
import { colors, radius, semantic, spacing } from '../../src/theme/tokens';
import { type } from '../../src/theme/typography';
import type { InspectionSummary } from '../../src/api/types';

/** Uma inspeção "de hoje" é a agendada para a data corrente. */
function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Concluído para o técnico: saiu da mão dele, já não há o que fazer hoje. */
const DONE: ReadonlyArray<string> = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'];

/** Esperando a decisão do supervisor. */
const IN_REVIEW: ReadonlyArray<string> = ['SUBMITTED', 'UNDER_REVIEW'];

/** Ainda depende do técnico — reprovada volta para cá. */
const PENDING: ReadonlyArray<string> = ['ASSIGNED', 'REJECTED'];

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { online, pending } = useSync();

  // O endpoint /dashboard/summary é restrito a ADMIN/SUPERVISOR, então o
  // progresso do técnico é derivado da própria carteira de inspeções.
  const load = useCallback(
    () => inspectionsApi.list({ technicianId: user?.id, size: 100 }),
    [user?.id],
  );
  const { data, loading, error, reload } = useAsync(load, [user?.id]);

  const all = data?.content ?? [];
  const today = all.filter((i) => isToday(i.scheduledFor));
  const completedToday = today.filter((i) => DONE.includes(i.status)).length;
  const inProgress = all.find((i) => i.status === 'IN_PROGRESS');
  const nextUp = all.find((i) => i.status === 'ASSIGNED');
  const highlight = inProgress ?? nextUp;
  const pct = today.length > 0 ? Math.round((completedToday / today.length) * 100) : 0;

  const stages = {
    pending: all.filter((i) => PENDING.includes(i.status)).length,
    inProgress: all.filter((i) => i.status === 'IN_PROGRESS').length,
    inReview: all.filter((i) => IN_REVIEW.includes(i.status)).length,
    done: all.filter((i) => i.status === 'APPROVED').length,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BrandHeader />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primaryContainer} />}
      >
        {/* Saudação */}
        <View>
          <Text style={type.labelCaps}>{label(user?.role)}</Text>
          <Text style={[type.headlineMd, { marginTop: 2 }]}>Olá, {user?.name ?? ''}</Text>
        </View>

        {loading && !data ? (
          <LoadingState />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            {/* Progresso do dia */}
            <Card>
              <View style={styles.rowBetween}>
                <Text style={type.headlineSm}>Progresso do Dia</Text>
                <Text style={[type.dataMono, { color: colors.primaryContainer, fontSize: 15 }]}>
                  {completedToday}/{today.length}
                </Text>
              </View>
              <View style={{ marginTop: spacing.sm }}>
                <ProgressBar value={completedToday} total={today.length} />
              </View>
              <Text style={[type.bodyMd, styles.muted, { marginTop: spacing.sm }]}>
                {today.length === 0
                  ? 'Nenhuma inspeção agendada para hoje.'
                  : completedToday === today.length
                    ? 'Todas as inspeções de hoje foram concluídas. Bom trabalho!'
                    : `Você está ${pct}% concluído com suas tarefas de hoje. Mantenha o ritmo!`}
              </Text>
            </Card>

            {/* Ações rápidas */}
            <View style={styles.quickRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/scanner')}
                style={({ pressed }) => [styles.quick, styles.quickPrimary, pressed && styles.pressed]}
              >
                <Ionicons name="qr-code-outline" size={26} color={colors.onSecondaryContainer} />
                <Text style={[type.bodyMdMedium, { color: colors.onSecondaryContainer, textAlign: 'center' }]}>
                  Escanear QR Ativo
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/(tabs)/sync')}
                style={({ pressed }) => [styles.quick, styles.quickSecondary, pressed && styles.pressed]}
              >
                <View>
                  <Ionicons name="sync-outline" size={26} color={colors.onSurface} />
                  {pending.length > 0 ? (
                    <View style={styles.quickBadge}>
                      <Text style={styles.quickBadgeText}>{pending.length}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[type.bodyMdMedium, { textAlign: 'center' }]}>Sincronizar Fila</Text>
              </Pressable>
            </View>

            {!online ? (
              <View style={styles.offlineNote}>
                <Ionicons name="cloud-offline-outline" size={18} color={semantic.warning.fg} />
                <Text style={[type.bodyMd, { color: semantic.warning.fg, flex: 1 }]}>
                  Você está offline. O trabalho é salvo no aparelho e enviado quando a rede voltar.
                </Text>
              </View>
            ) : null}

            {/* Onde está cada inspeção. Enviar tira do "Início" e move para
                "Em análise"; aprovada, termina em "Concluídas". */}
            <Card>
              <Text style={[type.labelCaps, { marginBottom: spacing.sm }]}>Situação das suas inspeções</Text>
              <View style={styles.stageRow}>
                <Stage
                  icon="time-outline"
                  label="Pendentes"
                  count={stages.pending}
                  tone={colors.onSurfaceVariant}
                  onPress={() => router.push('/(tabs)/inspections')}
                />
                <Stage
                  icon="play-circle-outline"
                  label="Em andamento"
                  count={stages.inProgress}
                  tone={semantic.warning.fg}
                  onPress={() => router.push('/(tabs)/inspections')}
                />
                <Stage
                  icon="hourglass-outline"
                  label="Em análise"
                  count={stages.inReview}
                  tone={semantic.info.fg}
                  onPress={() => router.push('/(tabs)/inspections')}
                />
                <Stage
                  icon="checkmark-circle-outline"
                  label="Concluídas"
                  count={stages.done}
                  tone={semantic.success.fg}
                  onPress={() => router.push('/(tabs)/inspections')}
                />
              </View>
            </Card>

            {/* Continuar inspeção */}
            {highlight ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={type.headlineSm}>
                  {highlight.status === 'IN_PROGRESS' ? 'Continuar Inspeção' : 'Próxima Inspeção'}
                </Text>
                <HighlightCard inspection={highlight} onOpen={() => router.push(`/inspection/${highlight.id}`)} />
              </View>
            ) : null}

            <Button
              title="Ver todas as inspeções"
              variant="secondary"
              iconRight="arrow-forward"
              onPress={() => router.push('/(tabs)/inspections')}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Uma etapa do ciclo, com quantas inspeções estão nela. */
function Stage({
  icon,
  label: text,
  count,
  tone,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  tone: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text}: ${count}`}
      onPress={onPress}
      style={({ pressed }) => [styles.stage, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={tone} />
      <Text style={[type.headlineSm, { color: tone }]}>{count}</Text>
      <Text style={[type.bodyMd, styles.stageLabel]} numberOfLines={2}>
        {text}
      </Text>
    </Pressable>
  );
}

function HighlightCard({ inspection, onOpen }: { inspection: InspectionSummary; onOpen: () => void }) {
  const running = inspection.status === 'IN_PROGRESS';
  return (
    <Card accent={running ? semantic.warning.fg : colors.primaryContainer}>
      <View style={styles.badgeRow}>
        <Badge tone={statusTone(inspection.status)}>{label(inspection.status)}</Badge>
        <Badge tone={priorityTone(inspection.priority)}>{label(inspection.priority)}</Badge>
      </View>

      <Text style={[type.headlineSm, { marginTop: spacing.sm }]}>
        {inspection.equipmentName ?? inspection.title}
      </Text>

      <View style={styles.locationRow}>
        <Ionicons name="location-outline" size={14} color={colors.onSurfaceVariant} />
        <Text style={[type.bodyMd, styles.muted]} numberOfLines={1}>
          {[inspection.clientName, inspection.siteName].filter(Boolean).join(' • ') || 'Local não informado'}
        </Text>
      </View>

      <Button
        title={running ? 'Continuar Checklist' : 'Abrir Inspeção'}
        iconRight="arrow-forward"
        onPress={onOpen}
        style={{ marginTop: spacing.md }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.gutter, gap: spacing.lg, paddingBottom: spacing.xl },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  muted: { color: colors.onSurfaceVariant },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  stageRow: { flexDirection: 'row', gap: spacing.xs },
  stage: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
  },
  stageLabel: { color: colors.onSurfaceVariant, textAlign: 'center', fontSize: 11 },

  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quick: {
    flex: 1,
    minHeight: 104,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  quickPrimary: { backgroundColor: colors.secondaryContainer },
  quickSecondary: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  pressed: { opacity: 0.85 },
  quickBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: semantic.warning.fg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: semantic.warning.bg,
    borderColor: 'rgba(180, 83, 9, 0.2)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
});
