import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Outcome } from '../store/useLibrary';
import { FONT_BODY, type Palette, useTheme } from './theme';

type Props = {
  groups: string[];
  onAdd: (raw: { name: string; group: string; url: string; metaUrl?: string }) => Promise<Outcome>;
  onExport: () => Promise<Outcome>;
  /** Reçoit de quoi dire où en est une playlist longue, résolue entrée par entrée. */
  onImport: (onProgress: (m: string) => void) => Promise<Outcome>;
  onFieldFocus: () => void;
};

export function AddStation({ groups, onAdd, onExport, onImport, onFieldFocus }: Props) {
  const { p: p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);

  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [url, setUrl] = useState('');
  const [metaUrl, setMetaUrl] = useState('');
  const [busy, setBusy] = useState(false);
  // Repliée par défaut : sur un téléphone, quatre champs et trois boutons
  // repoussent l'annuaire hors de l'écran alors qu'on ajoute rarement une
  // station à la main. Même traitement que la corbeille.
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<Outcome | null>(null);

  const run = async (fn: () => Promise<Outcome>, clear = false) => {
    setBusy(true);
    const out = await fn();
    setBusy(false);
    setMsg(out.message ? out : null);
    if (out.ok && clear) {
      setName('');
      setGroup('');
      setUrl('');
      setMetaUrl('');
    }
  };

  return (
    <View style={s.wrap}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Ajouter une station">
        <Text style={t.sectionLabel}>{(open ? '▾ ' : '▸ ') + 'Ajouter une station'}</Text>
      </Pressable>
      {open ? (
      <View style={s.body}>
        <TextInput
          style={t.input}
          value={name}
          onChangeText={setName}
          placeholder="Nom (ex : Fallout 4 — Far Harbor)"
          placeholderTextColor={p.dim}
          onFocus={onFieldFocus}
          accessibilityLabel="Nom de la station"
        />
        <TextInput
          style={t.input}
          value={group}
          onChangeText={setGroup}
          placeholder={groups.length ? `Groupe (ex : ${groups[0]})` : 'Groupe (facultatif)'}
          placeholderTextColor={p.dim}
          onFocus={onFieldFocus}
          accessibilityLabel="Groupe"
        />
        <TextInput
          style={t.input}
          value={url}
          onChangeText={setUrl}
          placeholder="URL stream (.mp3, .aac, .m3u, .pls, .m3u8)"
          placeholderTextColor={p.dim}
          autoCapitalize="none"
          keyboardType="url"
          onFocus={onFieldFocus}
          accessibilityLabel="URL du flux"
        />
        <TextInput
          style={t.input}
          value={metaUrl}
          onChangeText={setMetaUrl}
          placeholder="Métadonnées (optionnel) — /api/nowplaying/… ou /status-json.xsl"
          placeholderTextColor={p.dim}
          autoCapitalize="none"
          keyboardType="url"
          onFocus={onFieldFocus}
          accessibilityLabel="URL des métadonnées, facultative"
        />

        <View style={s.actions}>
          <Pressable
            style={t.btn}
            disabled={busy}
            onPress={() => run(() => onAdd({ name, group, url, metaUrl }), true)}
            accessibilityRole="button"
            onFocus={onFieldFocus}
          accessibilityLabel="Ajouter la station">
            <Text style={[t.btnText, busy && t.btnOff]}>+ AJOUTER</Text>
          </Pressable>
          <Pressable
            style={t.btn}
            disabled={busy}
            onPress={() => run(onExport)}
            accessibilityRole="button"
            onFocus={onFieldFocus}
          accessibilityLabel="Exporter mes stations">
            <Text style={[t.btnText, busy && t.btnOff]}>⇩ EXPORTER</Text>
          </Pressable>
          <Pressable
            style={t.btn}
            disabled={busy}
            onPress={() =>
              run(() => onImport((m) => setMsg({ ok: true, message: m })))
            }
            accessibilityRole="button"
            onFocus={onFieldFocus}
          accessibilityLabel="Importer une sauvegarde ou une playlist">
            <Text style={[t.btnText, busy && t.btnOff]}>⇧ IMPORTER</Text>
          </Pressable>
          {busy ? <ActivityIndicator color={p.base} /> : null}
        </View>

        {/* Le bouton accepte deux choses, et rien ne le dirait sinon : une
            sauvegarde de l'appli, ou la playlist d'un autre lecteur. */}
        <Text style={s.hint}>IMPORTER accepte une sauvegarde .json ou une playlist .m3u / .pls.</Text>

        {/* Le message est une région vivante : l'ajout est asynchrone (la playlist
            est résolue avant), donc le résultat arrive après le geste. */}
        <Text
          style={msg?.ok ? t.msgOk : t.msgErr}
          accessibilityLiveRegion="polite">
          {msg?.message ?? ' '}
        </Text>
      </View>
      ) : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: p.border, marginTop: 12 },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2, marginBottom: 6 },
  hint: { color: p.dim, fontFamily: FONT_BODY, fontSize: 10, marginBottom: 4 },
});
