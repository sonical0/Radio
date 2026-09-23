// Ce que l'annuaire reçoit et rend une fois la station en bibliothèque : le
// signalement d'écoute, et le rattrapage de fiche pour les stations ajoutées
// avant qu'on en garde une. Porté du site le 23/09/2026.

import { sanitizeFavicon, sanitizeUuid, type Station } from '../model/station';
import { rbFetch, rbJson } from './radioBrowser';

/** Ce qu'une fiche retrouvée apporte à une station qui n'en avait pas. */
export type DirectoryCard = { uuid: string | null; favicon: string | null };

// Une fois par station et par lancement. Le serveur ne compte de toute façon
// qu'une écoute par adresse IP et par jour.
const reported = new Set<string>();

/**
 * Signaler l'écoute d'une station de l'annuaire : c'est le compteur qui classe
 * ses résultats par popularité — celui-là même qu'utilise le tri par défaut — et
 * l'usage que Radio-Browser demande à ses clients.
 */
export function reportListen(s: Station | null | undefined): void {
  if (!s?.uuid || reported.has(s.uuid)) return;
  reported.add(s.uuid);
  rbFetch('/url/' + encodeURIComponent(s.uuid)).catch(() => {});
}

// Une fois par URL et par lancement, succès ou non : un flux absent de
// l'annuaire ne doit pas être redemandé à chaque écoute.
const lookedUp = new Set<string>();

type ByUrlHit = { stationuuid?: string; favicon?: string };

/**
 * Les stations ajoutées depuis l'annuaire avant qu'on en garde la fiche n'ont
 * ni identifiant ni favicon. On les retrouve par leur URL de flux, et seulement
 * pour les stations custom : les stations livrées ne viennent pas de l'annuaire.
 *
 * Rend la fiche à appliquer, ou `null` s'il n'y a rien à rattraper — c'est
 * l'appelant qui la pose dans la bibliothèque et la persiste.
 */
export async function backfillFromDirectory(
  s: Station | null | undefined,
): Promise<DirectoryCard | null> {
  if (!s?.isCustom || s.uuid || lookedUp.has(s.url)) return null;
  lookedUp.add(s.url);
  try {
    const data = await rbJson<unknown>('/stations/byurl', { url: s.url });
    const hit = (Array.isArray(data) ? (data as ByUrlHit[]) : []).find((x) =>
      sanitizeUuid(x?.stationuuid),
    );
    if (!hit) return null;
    // Repassés par les mêmes gardes que le reste : la fiche vient d'un annuaire
    // ouvert en écriture, elle n'entre pas sans validation.
    return { uuid: sanitizeUuid(hit.stationuuid), favicon: sanitizeFavicon(hit.favicon) };
  } catch {
    return null;
  }
}
