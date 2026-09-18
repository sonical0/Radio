import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Outcome } from '../store/useLibrary';
import { type Palette, useTheme } from './theme';

type Props = {
  groups: string[];
  onAdd: (raw: { name: string; group: string; url: string; metaUrl?: string }) => Promise<Outcome>;
  onExport: () => Promise<Outcome>;
  onImport: () => Promise<Outcome>;
};

export function AddStation({ groups, onAdd, onExport, onImport }: Props) {
  const { p: p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);

  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [url, setUrl] = useState('');
  const [metaUrl, setMetaUrl] = useState('');
  const [busy, setBusy] = useState(false);
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
      <Text style={t.sectionLabel}>Ajouter une station</Text>
      <View style={s.body}>
        <TextInput
          style={t.input}
          value={name}
          onChangeText={setName}
          placeholder="Nom (ex : Fallout 4 — Far Harbor)"
          placeholderTextColor={p.dim}
          accessibilityLabel="Nom de la station"
        />
        <TextInput
          style={t.input}
          value={group}
          onChangeText={setGroup}
          placeholder={groups.length ? `Groupe (ex : ${groups[0]})` : 'Groupe (facultatif)'}
          placeholderTextColor={p.dim}
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
          accessibilityLabel="URL des métadonnées, facultative"
        />

        <View style={s.actions}>
          <Pressable
            style={t.btn}
            disabled={busy}
            onPress={() => run(() => onAdd({ name, group, url, metaUrl }), true)}
            accessibilityRole="button"
            accessibilityLabel="Ajouter la station">
            <Text style={[t.btnText, busy && t.btnOff]}>+ AJOUTER</Text>
          </Pressable>
          <Pressable
            style={t.btn}
            disabled={busy}
            onPress={() => run(onExport)}
            accessibilityRole="button"
            accessibilityLabel="Exporter mes stations">
            <Text style={[t.btnText, busy && t.btnOff]}>⇩ EXPORTER</Text>
          </Pressable>
          <Pressable
            style={t.btn}
            disabled={busy}
            onPress={() => run(onImport)}
            accessibilityRole="button"
            accessibilityLabel="Importer des stations">
            <Text style={[t.btnText, busy && t.btnOff]}>⇧ IMPORTER</Text>
          </Pressable>
          {busy ? <ActivityIndicator color={p.base} /> : null}
        </View>

        {/* Le message est une région vivante : l'ajout est asynchrone (la playlist
            est résolue avant), donc le résultat arrive après le geste. */}
        <Text
          style={msg?.ok ? t.msgOk : t.msgErr}
          accessibilityLiveRegion="polite">
          {msg?.message ?? ' '}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: p.border, marginTop: 12 },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2, marginBottom: 6 },
});
