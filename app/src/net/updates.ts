// L'APK ne passe par aucun store : personne ne prévient l'utilisateur qu'une
// version est sortie, et une app sideloadée se périme en silence. On interroge
// donc l'API des releases GitHub — en lecture seule, sans clé, sans rien
// envoyer d'autre que la requête.

import appConfig from '../../app.json';

const RELEASES_API = 'https://api.github.com/repos/sonical0/Radio/releases/latest';
const TIMEOUT_MS = 8000;

/** La version de `app.json`, qui est aussi celle que porte l'APK installé. */
export const CURRENT_VERSION: string = appConfig.expo.version;

export type Release = { version: string; url: string };

/**
 * Compare deux versions de la forme `1.2.3`, le `v` du tag et un éventuel
 * suffixe (`-rc1`) étant ignorés. Une pré-version n'est donc jamais « plus
 * récente » que la version stable du même numéro, ce qui est le comportement
 * voulu : on ne pousse personne vers une release candidate.
 */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/i, '').split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/**
 * `/releases/latest` exclut déjà les brouillons et les pré-versions : ce que
 * l'API renvoie est ce qu'un visiteur verrait en haut de la page des releases.
 * Toute erreur — réseau coupé, quota GitHub atteint, réponse inattendue —
 * rend `null` : une vérification de mise à jour ne doit jamais faire de bruit.
 */
export async function fetchLatestRelease(): Promise<Release | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { tag_name?: string; html_url?: string };
    const tag = String(data?.tag_name ?? '').trim();
    if (!tag) return null;
    return {
      version: tag.replace(/^v/i, ''),
      url: String(data?.html_url ?? 'https://github.com/sonical0/Radio/releases'),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
