// Import / export — version navigateur, reprise du site : un Blob téléchargé et
// un <input type="file"> créé à la volée. Rien d'Expo ici, ces deux API n'ont
// pas d'équivalent mobile et l'inverse est vrai aussi.

export const EXPORT_FILENAME = 'fallout-radio-stations.json';

export async function exportJson(json: string): Promise<string> {
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = EXPORT_FILENAME;
  a.click();
  URL.revokeObjectURL(a.href);
  return 'téléchargé';
}

/** Un fichier choisi : son nom sert à départager M3U et PLS, et à grouper le lot. */
export type PickedFile = { name: string; text: string };

export async function pickFile(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // La sauvegarde JSON et les playlists d'autres lecteurs passent par le même
    // bouton : c'est le contenu qui décide, l'extension ne sert qu'à départager.
    input.accept = 'application/json,.json,.m3u,.m3u8,.pls';
    // Un utilisateur qui ferme le sélecteur sans rien choisir ne déclenche aucun
    // événement fiable selon les navigateurs : on résout sur 'cancel' quand il
    // existe, et on laisse la promesse en suspens sinon — inoffensif, l'appel
    // suivant recrée un input.
    input.addEventListener('cancel', () => resolve(null));
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    });
    input.click();
  });
}
