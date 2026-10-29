// Déclare l'appli auprès d'Android Auto.
//
// Le service de lecture de @rntp/player est déjà un MediaLibraryService
// (androidx.media3) exporté, et l'arbre des stations lui est confié depuis JS
// (publishBrowseTree, src/player/player.ts). Il ne manque que la déclaration :
// sans la meta-data `com.google.android.gms.car.application` pointant vers un
// `automotive_app_desc` qui annonce l'usage « media », Android Auto ignore
// l'appli, quel que soit le service qu'elle expose.
//
// Comme pour withReleaseSigning, `expo prebuild` régénère `android/` : le
// réglage n'existe que s'il est posé ici.

const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const META_NAME = 'com.google.android.gms.car.application';
const RESOURCE = '@xml/automotive_app_desc';
const DESC_XML = `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
    <uses name="media" />
</automotiveApp>
`;

module.exports = function withAndroidAuto(config) {
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    // Idempotent : une seconde passe de prebuild ne doit pas doubler l'entrée.
    app['meta-data'] = (app['meta-data'] ?? []).filter(
      (m) => m.$['android:name'] !== META_NAME,
    );
    app['meta-data'].push({ $: { 'android:name': META_NAME, 'android:resource': RESOURCE } });
    return cfg;
  });

  // Les ressources XML n'ont pas de mod dédié : on écrit le fichier à la main,
  // dans le res/ que le prebuild vient de générer.
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'automotive_app_desc.xml'), DESC_XML);
      return cfg;
    },
  ]);

  return config;
};
