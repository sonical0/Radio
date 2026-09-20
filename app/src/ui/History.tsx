import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { HistoryEntry } from '../store/useHistory';
import { FONT_BODY, type Palette, useTheme } from './theme';

/** Au-delà, on fait défiler pour rien : la recherche est là pour ça. */
const MAX_SHOWN = 60;

function clock(at: number): string {
  const d = new Date(at);
  const hhmm =
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const today = new Date().toDateString() === d.toDateString();
  return today ? hhmm : String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + hhmm;
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Le volet des titres passés, sur le patron de la corbeille : repliable, et
 * absent tant qu'il n'a rien à montrer.
 */
export function History({ entries, onClear }: { entries: HistoryEntry[]; onClear: () => void }) {
  const { p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);

  const shown = useMemo(() => {
    const q = normalize(query);
    const matching = q
      ? entries.filter((e) => normalize(e.title).includes(q) || normalize(e.station).includes(q))
      : entries;
    return matching.slice(0, MAX_SHOWN);
  }, [entries, query]);

  if (!entries.length) return null;

  return (
    <View style={s.wrap}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Titres passés, ${entries.length}`}>
        <Text style={t.sectionLabel}>
          {(open ? '▾ ' : '▸ ') + `Titres passés (${entries.length})`}
        </Text>
      </Pressable>

      {open ? (
        <View style={s.body}>
          <View style={s.row}>
            <TextInput
              style={[t.input, s.field]}
              value={query}
              onChangeText={setQuery}
              placeholder="CHERCHER UN TITRE"
              placeholderTextColor={p.dim}
              accessibilityLabel="Chercher dans les titres passés"
              autoCorrect={false}
            />
            {/* Effacer l'historique se confirme : c'est la seule action de
                cette application qui détruit quelque chose d'irrécupérable. */}
            <Pressable
              onPress={() => {
                if (confirming) {
                  onClear();
                  setConfirming(false);
                  setQuery('');
                } else {
                  setConfirming(true);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={confirming ? "Confirmer l'effacement" : "Effacer l'historique"}
              style={t.btn}>
              <Text style={t.btnText}>{confirming ? 'CONFIRMER' : 'EFFACER'}</Text>
            </Pressable>
          </View>

          {shown.length === 0 ? (
            <Text style={s.empty}>Aucun titre ne correspond.</Text>
          ) : (
            shown.map((e) => (
              <View key={e.url + e.at} style={s.item}>
                <Text style={s.time}>{clock(e.at)}</Text>
                <View style={s.texts}>
                  <Text style={s.title} numberOfLines={1}>
                    {e.title}
                  </Text>
                  <Text style={s.station} numberOfLines={1}>
                    {e.station}
                  </Text>
                </View>
              </View>
            ))
          )}

          {entries.length > shown.length ? (
            <Text style={s.more}>
              {shown.length} sur {entries.length} — affine la recherche pour voir le reste.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    wrap: { marginTop: 8 },
    body: { paddingHorizontal: 16, paddingTop: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    field: { flex: 1, marginBottom: 0 },
    item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
    },
    time: { color: p.dim, fontFamily: FONT_BODY, fontSize: 11, paddingTop: 2, minWidth: 42 },
    texts: { flex: 1 },
    title: { color: p.bright, fontFamily: FONT_BODY, fontSize: 13 },
    station: { color: p.dim, fontFamily: FONT_BODY, fontSize: 11 },
    empty: { color: p.dim, fontFamily: FONT_BODY, fontSize: 12, paddingVertical: 6 },
    more: { color: p.dim, fontFamily: FONT_BODY, fontSize: 11, paddingTop: 8, opacity: 0.8 },
  });
