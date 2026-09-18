// Injecte la configuration de signature release dans le projet Android.
//
// `expo prebuild` régénère `android/` : tout ce qu'on y écrirait à la main
// disparaîtrait à la prochaine passe. Un plugin de configuration est donc le
// seul endroit où ce réglage tient.
//
// Les identifiants vivent dans `keystore/credentials.properties`, hors dépôt
// (voir .gitignore) : ils ne doivent jamais être versionnés, et le trousseau
// non plus — c'est lui qui prouve que la mise à jour vient bien du même auteur.

const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const KEYS = ['RADIO_STORE_FILE', 'RADIO_KEY_ALIAS', 'RADIO_STORE_PASSWORD', 'RADIO_KEY_PASSWORD'];

function readCredentials(projectRoot) {
  const file = path.join(projectRoot, 'keystore', 'credentials.properties');
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return KEYS.every((k) => out[k]) ? out : null;
}

module.exports = function withReleaseSigning(config) {
  config = withGradleProperties(config, (cfg) => {
    const creds = readCredentials(cfg.modRequest.projectRoot);
    // Sans trousseau, on ne casse rien : le build debug continue de marcher, et
    // c'est le build release qui échouera, avec un message clair.
    if (!creds) return cfg;
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && KEYS.includes(item.key)),
    );
    for (const key of KEYS) {
      cfg.modResults.push({ type: 'property', key, value: creds[key] });
    }
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes('RADIO_STORE_FILE')) return cfg;

    g = g.replace(
      /signingConfigs \{/,
      `signingConfigs {
        release {
            if (project.hasProperty('RADIO_STORE_FILE')) {
                storeFile rootProject.file("../keystore/" + RADIO_STORE_FILE)
                storePassword RADIO_STORE_PASSWORD
                keyAlias RADIO_KEY_ALIAS
                keyPassword RADIO_KEY_PASSWORD
            }
        }`,
    );

    // Le gabarit d'Expo signe la release avec la clé de debug, et le dit en
    // commentaire. On ne remplace que cette occurrence-là : le bloc debug garde
    // la sienne.
    const releaseBlock = /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!releaseBlock.test(g)) {
      throw new Error('withReleaseSigning : bloc release introuvable dans build.gradle');
    }
    g = g.replace(releaseBlock, '$1signingConfig signingConfigs.release');

    cfg.modResults.contents = g;
    return cfg;
  });

  return config;
};
