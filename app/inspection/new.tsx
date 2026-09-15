import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../src/auth/AuthContext';
import {
  clients as clientsApi,
  equipment as equipmentApi,
  inspections as inspectionsApi,
  sites as sitesApi,
  templates as templatesApi,
  users as usersApi,
} from '../../src/api/endpoints';
import { messageFor } from '../../src/hooks/useAsync';
import { HttpError } from '../../src/api/client';
import { Button, Card, Field, LoadingState } from '../../src/components/ui';
import { Picker, SegmentedPicker, type Option } from '../../src/components/Picker';
import { ScreenHeader } from '../../src/components/Header';
import { colors, radius, semantic, spacing, touchTarget } from '../../src/theme/tokens';
import { type } from '../../src/theme/typography';
import type { Client, Equipment, Priority, Site, Template, UserResponse } from '../../src/api/types';

/**
 * Agendamento de inspeção.
 *
 * Fecha o ciclo dentro do app: o administrador monta a ordem de serviço e ela
 * aparece na agenda do técnico escolhido. Os cadastros encadeiam — o local
 * depende do cliente, o equipamento depende do local — porque é assim que o
 * domínio se organiza, e oferecer um ativo de outra planta só produziria erro
 * na submissão.
 */

const PRIORITIES: Option[] = [
  { value: 'LOW', label: 'Baixa' },
  { value: 'MEDIUM', label: 'Média' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'CRITICAL', label: 'Crítica' },
];

/** Amanhã às 9h — o padrão que evita agendar para um horário já vencido. */
function defaultSchedule(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function formatWhen(d: Date): string {
  return d.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `datetime-local` do navegador trabalha em horário local, sem fuso. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewInspectionScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [people, setPeople] = useState<UserResponse[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);

  const [clientId, setClientId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [technicianId, setTechnicianId] = useState<string | null>(null);
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [scheduledFor, setScheduledFor] = useState<Date>(defaultSchedule);
  const [showPicker, setShowPicker] = useState<'date' | 'time' | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  // --- Cadastros base ------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, t, u] = await Promise.all([
          clientsApi.list(),
          templatesApi.active(),
          usersApi.list(),
        ]);
        if (cancelled) return;
        setClients(c.content);
        // Sem versão publicada o modelo não gera inspeção: a API recusaria.
        const usable = t.content.filter((x) => x.currentVersion != null);
        setTemplates(usable);
        setPeople(u.content);
        if (usable.length === 1) setTemplateId(usable[0].id);
      } catch (e) {
        if (!cancelled) {
          setLoadError(messageFor(e).message);
          setForbidden(e instanceof HttpError && e.status === 403);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // O local depende do cliente; trocar o cliente invalida o que veio depois.
  useEffect(() => {
    setSiteId(null);
    setEquipmentId(null);
    setSites([]);
    setEquipment([]);
    if (!clientId) return;

    let cancelled = false;
    void (async () => {
      try {
        const page = await sitesApi.byClient(clientId);
        if (!cancelled) setSites(page.content);
      } catch {
        if (!cancelled) setSites([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    setEquipmentId(null);
    setEquipment([]);
    if (!siteId) return;

    let cancelled = false;
    void (async () => {
      try {
        const page = await equipmentApi.bySite(siteId);
        if (!cancelled) setEquipment(page.content);
      } catch {
        if (!cancelled) setEquipment([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const technicians = useMemo(
    () => people.filter((p) => p.role === 'TECHNICIAN' && p.status === 'ACTIVE'),
    [people],
  );
  const supervisors = useMemo(
    () => people.filter((p) => ['SUPERVISOR', 'ADMIN'].includes(p.role) && p.status === 'ACTIVE'),
    [people],
  );

  const missing = !clientId || !siteId || !templateId || !technicianId || !supervisorId || !title.trim();

  const submit = async () => {
    if (missing || saving) return;
    setSaving(true);
    setError(null);
    try {
      const inspection = await inspectionsApi.create({
        templateId: templateId!,
        clientId: clientId!,
        siteId: siteId!,
        equipmentId: equipmentId,
        technicianId: technicianId!,
        supervisorId: supervisorId!,
        title: title.trim(),
        instructions: instructions.trim() || null,
        priority,
        scheduledFor: scheduledFor.toISOString(),
      });
      setCreated(inspection.id);
    } catch (e) {
      setError(messageFor(e).message);
    } finally {
      setSaving(false);
    }
  };

  const opt = (list: { id: string; name?: string; title?: string }[], detail?: (x: any) => string | null) =>
    list.map((x) => ({
      value: x.id,
      label: x.name ?? x.title ?? x.id,
      detail: detail ? detail(x) : null,
    }));

  // --- Telas de estado -----------------------------------------------------
  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Agendar Inspeção" onBack={() => router.back()} />
        <LoadingState label="Carregando cadastros..." />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Agendar Inspeção" onBack={() => router.back()} />
        <View style={styles.centered}>
          <Card>
            <View style={styles.rowStart}>
              <Ionicons
                name={forbidden ? 'lock-closed-outline' : 'alert-circle-outline'}
                size={22}
                color={semantic.danger.fg}
              />
              <Text style={[type.titleMd, { flex: 1 }]}>Não foi possível carregar</Text>
            </View>
            <Text style={[type.bodyMd, styles.muted, { marginTop: spacing.xs }]}>{loadError}</Text>
            {forbidden ? (
              <Text style={[type.bodyMd, styles.muted, { marginTop: spacing.xs }]}>
                O agendamento exige perfil de administrador. Você está como{' '}
                {user?.role ?? 'desconhecido'}.
              </Text>
            ) : null}
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (created) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Agendar Inspeção" onBack={() => router.back()} />
        <View style={styles.centered}>
          <Card accent={semantic.success.fg}>
            <View style={styles.rowStart}>
              <Ionicons name="checkmark-circle" size={22} color={semantic.success.fg} />
              <Text style={[type.titleMd, { flex: 1 }]}>Inspeção agendada</Text>
            </View>
            <Text style={[type.headlineSm, { marginTop: spacing.xs }]}>{title}</Text>
            <Text style={[type.bodyMd, styles.muted]}>
              {formatWhen(scheduledFor)} ·{' '}
              {technicians.find((t) => t.id === technicianId)?.name ?? 'técnico'}
            </Text>
            <Text style={[type.bodyMd, styles.muted, { marginTop: spacing.xs }]}>
              Já aparece na agenda do técnico.
            </Text>

            <View style={{ gap: spacing.xs, marginTop: spacing.md }}>
              <Button
                title="Agendar outra"
                icon="add"
                variant="secondary"
                onPress={() => {
                  setCreated(null);
                  setTitle('');
                  setInstructions('');
                  setEquipmentId(null);
                  setScheduledFor(defaultSchedule());
                }}
              />
              <Button title="Concluir" icon="checkmark" onPress={() => router.back()} />
            </View>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  // --- Formulário ----------------------------------------------------------
  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Agendar Inspeção" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={type.labelCaps}>Onde</Text>

          <Picker
            label="Cliente"
            placeholder="Selecione o cliente"
            options={opt(clients)}
            value={clientId}
            onChange={setClientId}
          />

          <Picker
            label="Local"
            placeholder="Selecione o local"
            emptyHint="Escolha um cliente primeiro"
            options={opt(sites, (s: Site) => [s.addressLine, s.city].filter(Boolean).join(', ') || null)}
            value={siteId}
            onChange={setSiteId}
          />

          <Picker
            label="Equipamento (opcional)"
            placeholder="Selecione o ativo"
            emptyHint="Escolha um local primeiro"
            options={opt(equipment, (e: Equipment) => e.assetNumber ?? e.qrCode)}
            value={equipmentId}
            onChange={setEquipmentId}
          />
        </Card>

        <Card>
          <Text style={type.labelCaps}>O quê</Text>

          <Picker
            label="Modelo de checklist"
            placeholder="Selecione o modelo publicado"
            emptyHint="Nenhum modelo publicado"
            options={opt(templates, (t: Template) => `versão ${t.currentVersion ?? '—'}`)}
            value={templateId}
            onChange={setTemplateId}
          />

          <Field
            label="Título da inspeção"
            placeholder="Ex.: Preventiva trimestral — Compressor"
            value={title}
            onChangeText={setTitle}
          />

          <Field
            label="Instruções prévias (opcional)"
            placeholder="Acesso, EPI, janela de parada..."
            value={instructions}
            onChangeText={setInstructions}
            multiline
            style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.sm }}
          />

          <SegmentedPicker
            label="Prioridade"
            options={PRIORITIES}
            value={priority}
            onChange={(v) => setPriority(v as Priority)}
          />
        </Card>

        <Card>
          <Text style={type.labelCaps}>Quem e quando</Text>

          <Picker
            label="Técnico responsável"
            placeholder="Selecione o técnico"
            emptyHint="Nenhum técnico ativo"
            options={opt(technicians, (t: UserResponse) => t.email)}
            value={technicianId}
            onChange={setTechnicianId}
          />

          <Picker
            label="Supervisor"
            placeholder="Quem vai revisar"
            options={opt(supervisors, (s: UserResponse) => s.email)}
            value={supervisorId}
            onChange={setSupervisorId}
          />

          <View style={styles.field}>
            <Text style={[type.labelCaps, { marginBottom: 2 }]}>Data e hora</Text>

            {Platform.OS === 'web' ? (
              // No navegador o controle nativo do RN não existe; o input do
              // próprio navegador já traz calendário e relógio.
              <input
                type="datetime-local"
                value={toLocalInputValue(scheduledFor)}
                onChange={(e: any) => {
                  const next = new Date(e.target.value);
                  if (!Number.isNaN(next.getTime())) setScheduledFor(next);
                }}
                style={{
                  minHeight: touchTarget,
                  borderRadius: radius.md,
                  border: `1px solid ${colors.hairline}`,
                  background: colors.surfaceContainerLowest,
                  padding: `0 ${spacing.sm}px`,
                  fontSize: 16,
                  color: colors.onSurface,
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowPicker('date')}
                  style={({ pressed }) => [styles.dateButton, pressed && { opacity: 0.9 }]}
                >
                  <Ionicons name="calendar-outline" size={18} color={colors.onSurfaceVariant} />
                  <Text style={type.bodyLg}>
                    {scheduledFor.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowPicker('time')}
                  style={({ pressed }) => [styles.dateButton, pressed && { opacity: 0.9 }]}
                >
                  <Ionicons name="time-outline" size={18} color={colors.onSurfaceVariant} />
                  <Text style={type.bodyLg}>
                    {scheduledFor.toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </Pressable>
              </View>
            )}

            {showPicker ? (
              <DateTimePicker
                value={scheduledFor}
                mode={showPicker}
                onChange={(_, date) => {
                  setShowPicker(null);
                  if (date) setScheduledFor(date);
                }}
              />
            ) : null}

            <Text style={[type.bodyMd, styles.muted]}>{formatWhen(scheduledFor)}</Text>
          </View>
        </Card>

        {error ? (
          <View style={styles.error}>
            <Ionicons name="alert-circle-outline" size={18} color={semantic.danger.fg} />
            <Text style={[type.bodyMd, { color: semantic.danger.fg, flex: 1 }]}>{error}</Text>
          </View>
        ) : null}

        <Button
          title="Agendar inspeção"
          icon="calendar"
          onPress={() => void submit()}
          loading={saving}
          disabled={missing}
        />
        {missing ? (
          <Text style={[type.bodyMd, styles.muted, { textAlign: 'center' }]}>
            Preencha cliente, local, modelo, título, técnico e supervisor.
          </Text>
        ) : null}
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
  field: { gap: 6 },
  dateButton: {
    flex: 1,
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
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
