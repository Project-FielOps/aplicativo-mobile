import { Linking, Platform } from 'react-native';
import type { Site } from './api/types';

/**
 * Abre a rota até o local da inspeção no aplicativo de mapas do aparelho.
 *
 * A coordenada é preferida ao endereço: o ativo costuma estar dentro de uma
 * planta industrial, onde o número da rua leva o técnico ao portão errado. Sem
 * coordenada caímos no endereço escrito, e sem nenhum dos dois não há rota a
 * traçar — por isso `canNavigate` existe, para a tela não oferecer um botão
 * que não faria nada.
 */

export function canNavigate(site: Site | null | undefined): boolean {
  if (!site) return false;
  return hasCoordinates(site) || Boolean(addressOf(site));
}

function hasCoordinates(site: Site): boolean {
  return site.latitude != null && site.longitude != null;
}

/** Endereço em uma linha, para exibir e para buscar no mapa. */
export function addressOf(site: Site | null | undefined): string {
  if (!site) return '';
  return [site.addressLine, site.city, site.state].filter(Boolean).join(', ');
}

function mapsUrl(site: Site): string {
  if (hasCoordinates(site)) {
    const coords = `${site.latitude},${site.longitude}`;
    // No iOS o esquema nativo abre o Apple Maps já em modo de rota; nas demais
    // plataformas o link universal do Google Maps resolve tanto app quanto web.
    if (Platform.OS === 'ios') {
      return `maps://?daddr=${coords}&dirflg=d`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${coords}`;
  }

  const query = encodeURIComponent(`${site.name}, ${addressOf(site)}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export async function openInMaps(site: Site): Promise<void> {
  await Linking.openURL(mapsUrl(site));
}
