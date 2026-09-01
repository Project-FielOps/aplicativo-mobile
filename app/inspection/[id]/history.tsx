import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { equipment as equipmentApi, inspections as inspectionsApi } from '../../../src/api/endpoints';
import { useAsync } from '../../../src/hooks/useAsync';
import { Badge, Card, DataRow, EmptyState, ErrorState, LoadingState } from '../../../src/components/ui';
import { ScreenHeader } from '../../../src/components/Header';
import { formatDateTime, label, priorityTone, statusTone } from '../../../src/labels';
import { colors, radius, semantic, spacing } from '../../../src/theme/tokens';
import { type } from '../../../src/theme/typography';

/**
 * Histórico do ativo: todas as inspeções já feitas no mesmo equipamento, para o
 * técnico saber o que encontraram antes dele.
 */
export default function AssetHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const load = useCallback(async () => {
    const inspection = await inspectionsApi.get(id);
    if (!inspection.equipmentId || !inspection.siteId) {
      return { asset: null, history: [], current: inspection.id };
    }
    const [asset, history] = await Promise.all([
      equipmentApi.get(inspection.equipmentId).catch(() => null),
      inspectionsApi.byEquipment(inspection.siteId, inspection.equipmentId),
    ]);
    return { asset, history, current: inspection.id };
  }, [id]);

  const { data, loading, error, reload } = useAsync(load, [id]);
  const history = data?.history ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Histórico do Ativo" subtitle={data?.asset?.name} />

      {loading && !data ? (
        <View style={styles.pad}>
          <LoadingState />
        </View>
      ) : error && !data ? (
        <View style={styles.pad}>
          <ErrorState message={error} onRetry={reload} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primaryContainer} />
          }
        >
          {/* Ficha do ativo */}
          {data?.asset ? (
            <Card>
              <View style={styles.assetHeader}>
                <View style={styles.assetIcon}>
                  <Ionicons name="hardware-chip-outline" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.headlineSm}>{data.asset.name}</Text>
                  <Text style={[type.bodyMd, styles.muted]}>
                    {[data.asset.siteName, data.asset.clientName].filter(Boolean).join(' • ') || '—'}
                  </Text>
                </View>
                <Badge tone={data.asset.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {label(data.asset.status)}
                </Badge>
              </View>

              <View style={styles.dataStrip}>
                <DataRow label="Fabricante" value={data.asset.manufacturer} />
                <DataRow label="Modelo" value={data.asset.model} />
                <DataRow label="Série" value={data.asset.serialNumber} />
                <DataRow label="Patrimônio" value={data.asset.assetNumber} />
                <DataRow label="QR Code" value={data.asset.qrCode} />
                <DataRow label="Instalado em" value={data.asset.installedAt} />
              </View>
            </Card>
          ) : null}

          <Text style={type.headlineSm}>Linha do tempo</Text>

          {history.length === 0 ? (
            <EmptyState
              icon="time-outline"
              title="Sem inspeções anteriores"
              message="Este é o primeiro registro para o ativo."
            />
          ) : (
            <View style={styles.timeline}>
              {history.map((entry, index) => {
                const isCurrent = entry.id === data?.current;
                return (
                  <View key={entry.id} style={styles.timelineRow}>
                    {/* Trilho */}
                    <View style={styles.rail}>
                      <View
                        style={[
                          styles.railDot,
                          {
                            backgroundColor: isCurrent
                              ? colors.primaryContainer
                              : semantic[statusTone(entry.status)].fg,
                          },
                        ]}
                      />
                      {index < history.length - 1 ? <View style={styles.railLine} /> : null}
                    </View>

                    <Card style={styles.timelineCard}>
                      <View style={styles.rowBetween}>
                        <Text style={[type.titleMd, { flex: 1 }]}>{entry.title}</Text>
                        {isCurrent ? <Badge tone="info">Atual</Badge> : null}
                      </View>

                      <Text style={[type.dataMono, styles.muted, { marginTop: 2 }]}>
                        {formatDateTime(entry.scheduledFor)}
                      </Text>

                      <View style={styles.badgeRow}>
                        <Badge tone={statusTone(entry.status)}>{label(entry.status)}</Badge>
                        <Badge tone={priorityTone(entry.priority)}>{label(entry.priority)}</Badge>
                      </View>

                      {entry.technicianName ? (
                        <View style={styles.techRow}>
                          <Ionicons name="person-outline" size={14} color={colors.onSurfaceVariant} />
                          <Text style={[type.bodyMd, styles.muted]}>{entry.technicianName}</Text>
                        </View>
                      ) : null}
                    </Card>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pad: { padding: spacing.gutter },
  scroll: { padding: spacing.gutter, gap: spacing.md, paddingBottom: spacing.xl },
  muted: { color: colors.onSurfaceVariant },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  assetHeader: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  assetIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', gap: spacing.sm },
  rail: { width: 16, alignItems: 'center', paddingTop: spacing.md },
  railDot: { width: 12, height: 12, borderRadius: radius.full },
  railLine: { flex: 1, width: 2, backgroundColor: colors.hairline, marginTop: 4 },
  timelineCard: { flex: 1, marginBottom: spacing.sm },
  badgeRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
  techRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
});
