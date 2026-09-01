import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, elevation, online as onlineColor, radius, semantic, spacing, touchTarget, type SemanticTone } from '../theme/tokens';
import { type } from '../theme/typography';

/**
 * Primitivas do Precision System.
 *
 * Todas seguem as mesmas três regras: card 16px / botão 12px / badge 8px de
 * raio, contorno de 1px para definição sob sol forte, e nenhum alvo de toque
 * abaixo de 44px.
 */

// --- Card ------------------------------------------------------------------

export function Card({
  children,
  style,
  accent,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Faixa de acento à esquerda, como nos cards de prioridade do protótipo. */
  accent?: string;
}) {
  return (
    <View style={[styles.card, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null, style]}>
      {children}
    </View>
  );
}

// --- Badge -----------------------------------------------------------------

export function Badge({ tone, children }: { tone: SemanticTone; children: string }) {
  const c = semantic[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[type.labelCaps, { color: c.fg }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

// --- Botões ----------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primaryContainer, fg: '#ffffff' },
    secondary: { bg: colors.surfaceContainerLowest, fg: colors.onSurface, border: colors.hairline },
    ghost: { bg: 'transparent', fg: colors.primaryContainer },
    danger: { bg: semantic.danger.fg, fg: '#ffffff' },
  };
  const p = palette[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled) }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: p.bg },
        p.border ? { borderWidth: 1, borderColor: p.border } : null,
        variant === 'primary' && !isDisabled ? elevation.primary : null,
        isDisabled ? styles.buttonDisabled : null,
        pressed && !isDisabled ? styles.buttonPressed : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={p.fg} /> : null}
          <Text style={[type.bodyMdMedium, styles.buttonLabel, { color: p.fg }]}>{title}</Text>
          {iconRight ? <Ionicons name={iconRight} size={18} color={p.fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

// --- Campo de texto --------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  style,
  ...inputProps
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={[type.labelCaps, styles.fieldLabel]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.outline}
        style={[
          styles.input,
          type.bodyLg,
          error ? { borderColor: semantic.danger.fg } : null,
          style as ViewStyle,
        ]}
        {...inputProps}
      />
      {error ? (
        <Text style={[type.bodyMd, { color: semantic.danger.fg }]}>{error}</Text>
      ) : hint ? (
        <Text style={[type.bodyMd, { color: colors.onSurfaceVariant }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

// --- Barra de progresso ----------------------------------------------------

export function ProgressBar({
  value,
  total,
  color = colors.primaryContainer,
}: {
  value: number;
  total: number;
  color?: string;
}) {
  const pct = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  return (
    <View
      style={styles.progressTrack}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: value }}
    >
      <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

// --- Ponto de estado -------------------------------------------------------

export function StatusDot({ ok }: { ok: boolean }) {
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: ok ? onlineColor : semantic.warning.fg },
        ok ? styles.dotGlow : null,
      ]}
    />
  );
}

// --- Estados de tela -------------------------------------------------------

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}) {
  return (
    <View style={styles.stateBox}>
      <View style={styles.stateIcon}>
        <Ionicons name={icon} size={24} color={colors.outline} />
      </View>
      <Text style={[type.titleMd, styles.stateTitle]}>{title}</Text>
      {message ? <Text style={[type.bodyMd, styles.stateMessage]}>{message}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.stateBox}>
      <View style={[styles.stateIcon, { backgroundColor: semantic.danger.bg }]}>
        <Ionicons name="alert-circle-outline" size={24} color={semantic.danger.fg} />
      </View>
      <Text style={[type.titleMd, styles.stateTitle]}>Não foi possível carregar</Text>
      <Text style={[type.bodyMd, styles.stateMessage]}>{message}</Text>
      {onRetry ? (
        <Button title="Tentar novamente" icon="refresh" variant="secondary" onPress={onRetry} style={{ marginTop: spacing.md }} />
      ) : null}
    </View>
  );
}

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator color={colors.primaryContainer} />
      <Text style={[type.bodyMd, styles.stateMessage]}>{label}</Text>
    </View>
  );
}

// --- Linha de dado técnico -------------------------------------------------

/** "Data Strip": leitura técnica em monoespaçada, sobre fundo próprio. */
export function DataRow({ label: name, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.dataCell}>
      <Text style={type.labelCaps}>{name}</Text>
      <Text style={[type.dataMono, { marginTop: 2 }]} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    ...elevation.level1,
  },
  badge: {
    borderRadius: radius.base,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  buttonLabel: { fontSize: 15 },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.88 },
  field: { gap: 6 },
  fieldLabel: { marginLeft: 2 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.full },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  dotGlow: {
    shadowColor: onlineColor,
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 48,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  stateIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: { textAlign: 'center' },
  stateMessage: { textAlign: 'center', color: colors.onSurfaceVariant },
  dataCell: { flex: 1, minWidth: '45%', paddingVertical: spacing.xs },
});
