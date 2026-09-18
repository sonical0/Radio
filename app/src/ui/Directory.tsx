import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { searchDirectory, type DirectoryHit } from '../net/directory';
import type { Outcome } from '../store/useLibrary';
import { type Palette, useTheme } from './theme';

type Props = {
  onAdd: (raw: { name: string; group: string; url: string }) => Promise<Outcome>;
  onFieldFocus: () => void;
};

export function Directory({ onAdd, onFieldFocus }: Props) {
  const { p: p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<DirectoryHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // Chaque URL ajoutée est retenue pour que sa ligne le dise, plutôt que de
  // laisser croire qu'un second appui ferait quelque chose.
  const [added, setAdded] = useState<Record<string, string>>({});
  // Une recherche lente ne doit pas écraser le résultat d'une recherche lancée
  // après elle : seul le dernier numéro de séquence a le droit d'écrire.
  const seq = useRef(0);

  const run = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    const mine = ++seq.current;
    setBusy(true);
    setMsg('⟳ Recherche…');
    try {
      const list = await searchDirectory(q);
      if (mine !== seq.current) return;
      setHits(list);
      setMsg(list.length ? '' : `Aucun résultat pour « ${q} ».`);
    } catch {
      if (mine === seq.current) setMsg('⚠ Annuaire injoignable.');
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }, [query]);

  const add = useCallback(
    async (hit: DirectoryHit) => {
      // Le pays regroupe bien mieux qu'un fourre-tout unique : une recherche
      // « jazz » ramène des stations de dix pays différents.
      const out = await onAdd({ name: hit.name, group: hit.countryCode, url: hit.url });
      setAdded((prev) => ({ ...prev, [hit.url]: out.ok ? '✓' : '=' }));
    },
    [onAdd],
  );

  return (
    <View style={s.wrap}>
      <Text style={t.sectionLabel}>Annuaire Radio-Browser</Text>
      <View style={s.body}>
        <View style={s.searchRow}>
          <TextInput
            style={[t.input, s.field]}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={run}
            returnKeyType="search"
            placeholder="Chercher une radio (nom, genre, pays…)"
            placeholderTextColor={p.dim}
            autoCapitalize="none"
            onFocus={onFieldFocus}
            accessibilityLabel="Rechercher dans l'annuaire"
          />
          <Pressable
            style={t.btn}
            disabled={busy}
            onPress={run}
            accessibilityRole="button"
            accessibilityLabel="Chercher">
            <Text style={[t.btnText, busy && t.btnOff]}>⌕ CHERCHER</Text>
          </Pressable>
          {busy ? <ActivityIndicator color={p.base} /> : null}
        </View>

        {msg ? (
          <Text style={t.msgOk} accessibilityLiveRegion="polite">
            {msg}
          </Text>
        ) : null}

        {hits?.map((hit) => (
          <View key={hit.url} style={s.item}>
            <View style={s.info}>
              <Text style={s.name} numberOfLines={1}>
                {hit.name}
              </Text>
              <Text style={s.detail} numberOfLines={1}>
                {hit.detail}
              </Text>
            </View>
            <Pressable
              style={t.btn}
              disabled={!!added[hit.url]}
              onPress={() => add(hit)}
              accessibilityRole="button"
              accessibilityLabel={
                added[hit.url] === '✓'
                  ? `Ajoutée : ${hit.name}`
                  : added[hit.url]
                    ? `Déjà présente : ${hit.name}`
                    : `Ajouter ${hit.name}`
              }>
              <Text style={[t.btnText, added[hit.url] && t.btnOff]}>{added[hit.url] ?? '+'}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: p.border, marginTop: 12 },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  field: { flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: p.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
  },
  info: { flex: 1, minWidth: 0 },
  name: { color: p.bright, fontSize: 13 },
  detail: { color: p.dim, fontSize: 10, marginTop: 2 },
});
