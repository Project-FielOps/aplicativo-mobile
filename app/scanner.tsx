import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { equipment as equipmentApi } from '../src/api/endpoints';
import { HttpError, OfflineError } from '../src/api/client';
import { verification } from '../src/inspection/verification';
import { Badge, Button, Card, DataRow, Field } from '../src/components/ui';
import { label } from '../src/labels';
import { colors, radius, semantic, spacing } from '../src/theme/tokens';
import { type } from '../src/theme/typography';
import type { Equipment } from '../src/api/types';

/**
 * A leitura por câmera é o caminho principal em qualquer plataforma. Digitar o
 * código é a saída para quando ela não dá conta: etiqueta arrancada ou ilegível
 * no campo, e navegador sem câmera ou sem suporte a detecção de código. A
 * consulta do ativo, a conferência contra o esperado e o registro da verificação
 * são os mesmos nos dois caminhos — só muda de onde vem o código.
 */

type Outcome =
  | { kind: 'idle' }
  | { kind: 'looking' }
  | { kind: 'found'; asset: Equipment; matches: boolean }
  | { kind: 'error'; message: string };

export default function ScannerScreen() {
  const { inspectionId, expectedEquipmentId } = useLocalSearchParams<{
    inspectionId?: string;
    expectedEquipmentId?: string;
  }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [manualCode, setManualCode] = useState('');
  // A câmera manda; digitar é a saída quando ela falha. Na web já começa
  // aberto, porque lá a detecção de QR não é confiável.
  const [typing, setTyping] = useState(Platform.OS === 'web');
  // Um QR na mira dispara dezenas de leituras por segundo; sem a trava o
  // aparelho faria uma requisição por quadro.
  const busy = useRef(false);

  const verifying = Boolean(inspectionId && expectedEquipmentId);

  const onScan = async (data: string) => {
    if (busy.current) return;
    busy.current = true;
    setOutcome({ kind: 'looking' });

    try {
      const asset = await equipmentApi.byQrCode(data.trim());
      const matches = !verifying || asset.id === expectedEquipmentId;
      setOutcome({ kind: 'found', asset, matches });
    } catch (e) {
      const message =
        e instanceof OfflineError
          ? 'Sem conexão para consultar o ativo. Conecte-se e tente de novo.'
          : e instanceof HttpError && e.status === 404
            ? 'Nenhum ativo cadastrado com este QR Code.'
            : e instanceof Error
              ? e.message
              : 'Falha ao ler o QR Code.';
      setOutcome({ kind: 'error', message });
    }
  };

  const reset = () => {
    busy.current = false;
    setManualCode('');
    setOutcome({ kind: 'idle' });
  };

  /**
   * Preenche o código a partir do ativo que esta inspeção espera. Poupa digitar
   * a etiqueta inteira quando o técnico já está diante do equipamento certo — e
   * é o que permite percorrer o fluxo no navegador, sem câmera.
   */
  const fillExpectedCode = async () => {
    if (!expectedEquipmentId) return;
    try {
      const asset = await equipmentApi.get(expectedEquipmentId);
      if (asset.qrCode) setManualCode(asset.qrCode);
    } catch {
      setOutcome({ kind: 'error', message: 'Não foi possível consultar o ativo esperado.' });
    }
  };

  const confirm = async () => {
    if (outcome.kind !== 'found' || !inspectionId) return;
    await verification.markVerified(inspectionId, outcome.asset.id);
    router.back();
  };

  // --- Código digitado ----------------------------------------------------
  if (typing) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Identificar Ativo" onClose={() => router.back()} />
        <ScrollView contentContainerStyle={styles.manualScroll}>
          {outcome.kind === 'found' || outcome.kind === 'error' ? (
            <ResultCard
              outcome={outcome}
              verifying={verifying}
              onReset={reset}
              onConfirm={() => void confirm()}
            />
          ) : (
            <Card>
              <View style={styles.rowStart}>
                <Ionicons name="keypad-outline" size={22} color={colors.primaryContainer} />
                <Text style={[type.titleMd, { flex: 1 }]}>Código do ativo</Text>
              </View>
              <Text style={[type.bodyMd, styles.muted, { marginTop: spacing.xs }]}>
                Digite o código impresso na etiqueta do equipamento. A conferência é a mesma da
                leitura por QR Code.
              </Text>

              <Field
                label="Código"
                placeholder="Ex.: QR-AC-001"
                value={manualCode}
                onChangeText={setManualCode}
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={() => void onScan(manualCode)}
                returnKeyType="go"
              />

              <View style={{ gap: spacing.xs }}>
                <Button
                  title={outcome.kind === 'looking' ? 'Consultando...' : 'Identificar ativo'}
                  icon="search"
                  onPress={() => void onScan(manualCode)}
                  loading={outcome.kind === 'looking'}
                />
                {expectedEquipmentId ? (
                  <Button
                    title="Usar o ativo desta inspeção"
                    icon="sparkles-outline"
                    variant="secondary"
                    onPress={() => void fillExpectedCode()}
                  />
                ) : null}
                <Button
                  title="Usar a câmera"
                  icon="camera-outline"
                  variant="ghost"
                  onPress={() => {
                    reset();
                    setTyping(false);
                  }}
                />
              </View>
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- Permissão ---------------------------------------------------------
  if (!permission) return <View style={styles.black} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Escanear QR do Ativo" onClose={() => router.back()} />
        <View style={styles.permission}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera-outline" size={28} color={colors.primaryContainer} />
          </View>
          <Text style={type.headlineSm}>Permissão de câmera</Text>
          <Text style={[type.bodyMd, styles.mutedCenter]}>
            O FieldOps usa a câmera para ler o QR Code do equipamento e confirmar que você está
            diante do ativo correto.
          </Text>
          <Button title="Permitir acesso" icon="camera" onPress={() => void requestPermission()} />
          <Button
            title="Digitar o código"
            icon="keypad-outline"
            variant="secondary"
            onPress={() => setTyping(true)}
          />
        </View>
      </SafeAreaView>
    );
  }

  // --- Câmera ------------------------------------------------------------
  return (
    <View style={styles.black}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={outcome.kind === 'idle' ? ({ data }) => void onScan(data) : undefined}
      />

      <SafeAreaView style={styles.overlay}>
        <Header title="Escanear QR do Ativo" onClose={() => router.back()} dark />

        {outcome.kind === 'idle' || outcome.kind === 'looking' ? (
          <View style={styles.aimArea}>
            <View style={styles.frame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={[type.bodyLg, styles.hint]}>
              {outcome.kind === 'looking'
                ? 'Consultando o ativo...'
                : 'Aponte para o QR Code fixado no equipamento'}
            </Text>

            {/* Etiqueta arrancada ou ilegível é rotina em campo — sem esta
                saída o técnico ficaria travado diante do ativo certo. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => setTyping(true)}
              style={({ pressed }) => [styles.typeInstead, pressed && { opacity: 0.85 }]}
              hitSlop={8}
            >
              <Ionicons name="keypad-outline" size={18} color="#ffffff" />
              <Text style={[type.bodyMdMedium, { color: '#ffffff' }]}>Digitar o código</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.resultArea}>
            <ResultCard
              outcome={outcome}
              verifying={verifying}
              onReset={reset}
              onConfirm={() => void confirm()}
            />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

/** Desfecho da identificação — igual para a câmera e para o código digitado. */
function ResultCard({
  outcome,
  verifying,
  onReset,
  onConfirm,
}: {
  outcome: Extract<Outcome, { kind: 'found' } | { kind: 'error' }>;
  verifying: boolean;
  onReset: () => void;
  onConfirm: () => void;
}) {
  if (outcome.kind === 'error') {
    return (
      <Card>
        <View style={styles.rowStart}>
          <Ionicons name="alert-circle" size={22} color={semantic.danger.fg} />
          <Text style={[type.titleMd, { flex: 1 }]}>Não foi possível identificar</Text>
        </View>
        <Text style={[type.bodyMd, styles.muted, { marginTop: spacing.xs }]}>{outcome.message}</Text>
        <Button
          title="Tentar novamente"
          icon="refresh"
          variant="secondary"
          onPress={onReset}
          style={{ marginTop: spacing.md }}
        />
      </Card>
    );
  }

  return (
    <Card accent={outcome.matches ? semantic.success.fg : semantic.danger.fg}>
      <View style={styles.rowStart}>
        <Ionicons
          name={outcome.matches ? 'checkmark-circle' : 'close-circle'}
          size={22}
          color={outcome.matches ? semantic.success.fg : semantic.danger.fg}
        />
        <Text style={[type.titleMd, { flex: 1 }]}>
          {outcome.matches ? 'Ativo identificado' : 'Ativo diferente do esperado'}
        </Text>
        <Badge tone={outcome.asset.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {label(outcome.asset.status)}
        </Badge>
      </View>

      <Text style={[type.headlineSm, { marginTop: spacing.xs }]}>{outcome.asset.name}</Text>
      <Text style={[type.bodyMd, styles.muted]}>
        {[outcome.asset.siteName, outcome.asset.clientName].filter(Boolean).join(' • ') || '—'}
      </Text>

      <View style={styles.dataStrip}>
        <DataRow label="Série" value={outcome.asset.serialNumber} />
        <DataRow label="Patrimônio" value={outcome.asset.assetNumber} />
      </View>

      {!outcome.matches ? (
        <Text style={[type.bodyMd, { color: semantic.danger.fg, marginBottom: spacing.xs }]}>
          Este não é o equipamento desta inspeção. Confirme a etiqueta antes de continuar —
          inspecionar o ativo errado invalida o laudo.
        </Text>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        {verifying && outcome.matches ? (
          <Button title="Confirmar e voltar" icon="checkmark" onPress={onConfirm} />
        ) : null}
        <Button title="Identificar outro" variant="secondary" icon="refresh" onPress={onReset} />
      </View>
    </Card>
  );
}

function Header({
  title,
  onClose,
  dark,
}: {
  title: string;
  onClose: () => void;
  dark?: boolean;
}) {
  return (
    <View style={[styles.header, dark && styles.headerDark]}>
      <Text style={[type.titleMd, dark && { color: '#ffffff' }]}>{title}</Text>
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={12}>
        <Ionicons name="close" size={26} color={dark ? '#ffffff' : colors.onSurface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000000' },
  safe: { flex: 1, backgroundColor: colors.background },
  overlay: { flex: 1, justifyContent: 'space-between' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  headerDark: { backgroundColor: 'rgba(0,0,0,0.35)' },
  aimArea: { alignItems: 'center', gap: spacing.lg, paddingBottom: 96 },
  frame: { width: 240, height: 240 },
  corner: { position: 'absolute', width: 44, height: 44, borderColor: '#ffffff' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radius.lg },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radius.lg },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radius.lg },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radius.lg },
  hint: { color: '#ffffff', textAlign: 'center', paddingHorizontal: spacing.xl },
  resultArea: { padding: spacing.gutter },
  manualScroll: { padding: spacing.gutter, gap: spacing.md },
  typeInstead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  muted: { color: colors.onSurfaceVariant },
  mutedCenter: { color: colors.onSurfaceVariant, textAlign: 'center' },
  dataStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    marginVertical: spacing.sm,
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  permissionIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: semantic.info.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
