// Accès HTTP à Radio-Browser, partagé par tout ce qui interroge l'annuaire :
// la recherche, le parcours, le compteur d'écoutes, le rattrapage de fiche.
//
// Porté du site le 23/09/2026, avec son repli de miroir. Jusque-là l'app
// tapait `all.api` en dur dans `directory.ts` : le nom tournant en panne, plus
// rien ne répondait.

const RB_HOSTS = ['all.api.radio-browser.info', 'de1.api.radio-browser.info'];
const RB_TIMEOUT_MS = 10000;

/**
 * L'hôte qui a répondu en dernier. On ne repasse pas par un hôte en panne à
 * chaque requête : le repli se retient pour la durée de la session.
 */
let rbHost = RB_HOSTS[0];

/** GET sur l'API, avec repli sur l'autre hôte si le premier ne répond pas. */
export async function rbFetch(
  path: string,
  params?: Record<string, string>,
): Promise<Response> {
  const qs = params ? '?' + new URLSearchParams(params) : '';
  const hosts = [rbHost, ...RB_HOSTS.filter((h) => h !== rbHost)];
  let lastErr: unknown;
  for (const host of hosts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), RB_TIMEOUT_MS);
    try {
      const r = await fetch('https://' + host + '/json' + path + qs, { signal: ctrl.signal });
      // Un 4xx est une réponse : la demande est en cause, pas l'hôte. Changer
      // de miroir ne la rendrait pas valide, et masquerait l'erreur.
      if (r.status >= 500) throw new Error('HTTP ' + r.status);
      rbHost = host;
      return r;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

export async function rbJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const r = await rbFetch(path, params);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()) as T;
}
