// Import / export du fichier de stations — version téléphone.
// Metro choisit ce fichier sur Android et iOS, et `transfer.web.ts` dans le
// navigateur : c'est le seul endroit où les deux cibles divergent vraiment,
// parce qu'un téléphone n'a ni téléchargement ni <input type="file">.

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const EXPORT_FILENAME = 'fallout-radio-stations.json';

/**
 * Écrit le JSON dans le cache puis ouvre la feuille de partage du système —
 * l'utilisateur choisit lui-même où il atterrit (Drive, Fichiers, un mail).
 * Sans partage disponible, on rend le chemin du fichier pour au moins le dire.
 */
export async function exportJson(json: string): Promise<string> {
  const file = new File(Paths.cache, EXPORT_FILENAME);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Exporter mes stations',
      UTI: 'public.json',
    });
    return 'partagé';
  }
  return file.uri;
}

/** Renvoie le contenu du fichier choisi, ou null si l'utilisateur annule. */
export async function pickJson(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  return new File(res.assets[0].uri).text();
}
