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

/** Un fichier choisi : son nom sert à départager M3U et PLS, et à grouper le lot. */
export type PickedFile = { name: string; text: string };

/**
 * Le sélecteur n'est plus restreint au JSON : le même bouton accepte une
 * playlist d'un autre lecteur. Les M3U et PLS arrivent sous des types très
 * variables selon l'application qui les a écrites (`audio/x-mpegurl`,
 * `audio/x-scpls`, souvent `application/octet-stream`) — un filtre par type les
 * aurait rendues invisibles dans le sélecteur. C'est le contenu qui décide
 * ensuite, et un fichier qui n'est ni l'un ni l'autre est refusé avec un
 * message.
 */
export async function pickFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  return { name: asset.name ?? '', text: await new File(asset.uri).text() };
}
