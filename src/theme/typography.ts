import { TextStyle } from 'react-native';
import { colors } from './tokens';

/**
 * Abordagem dual-sans do Precision System, separando "Narrativa" de "Utilidade":
 *
 * - Plus Jakarta Sans — títulos. Aberturas largas e construção geométrica dão a
 *   sensação premium.
 * - Inter — corpo e rótulos de formulário, pela legibilidade neutra.
 * - JetBrains Mono — dado técnico bruto (número de série, patrimônio, coordenada,
 *   timestamp). Separa visualmente a interface do dado industrial.
 */
export const fonts = {
  headline: 'PlusJakartaSans_700Bold',
  headlineSemi: 'PlusJakartaSans_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
} as const;

export const type = {
  /** Reservado para stat "hero" do dashboard e título de estado vazio. */
  displayLg: {
    fontFamily: fonts.headline,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.64,
    color: colors.onSurface,
  } as TextStyle,

  headlineMd: {
    fontFamily: fonts.headlineSemi,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.24,
    color: colors.onSurface,
  } as TextStyle,

  /** Padrão para título de tela no mobile. */
  headlineSm: {
    fontFamily: fonts.headlineSemi,
    fontSize: 20,
    lineHeight: 28,
    color: colors.onSurface,
  } as TextStyle,

  titleMd: {
    fontFamily: fonts.headlineSemi,
    fontSize: 16,
    lineHeight: 24,
    color: colors.onSurface,
  } as TextStyle,

  bodyLg: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.onSurface,
  } as TextStyle,

  bodyMd: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onSurface,
  } as TextStyle,

  bodyMdMedium: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onSurface,
  } as TextStyle,

  /** Rótulo em caixa alta com tracking — usado em metadados e cabeçalhos. */
  labelCaps: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.onSurfaceVariant,
  } as TextStyle,

  /** Dado técnico bruto. */
  dataMono: {
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 18,
    color: colors.onSurface,
  } as TextStyle,
};
