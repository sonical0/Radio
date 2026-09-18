import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Station } from '../model/station';
import { BORDER, DIM, GREEN, RED, t } from './theme';

type Props = {
  hidden: Station[];
  onRestore: (url: string) => void;
  onPurge: (url: string) => void;
};

/**
 * Corbeille dépliable, affichée seulement quand elle n'est pas vide. La
 * suppression définitive n'y existe que pour les stations custom : une station
 * livrée revient de stations.json au prochain chargement, la « supprimer »
 * n'aurait de sens que jusque-là.
 */
export function Trash({ hidden, onRestore, onPurge }: Props) {
  const [open, setOpen] = useState(false);
  if (!hidden.length) return null;

  return (
    <View style={s.wrap}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Stations masquées, ${hidden.length}`}>
        <Text style={t.sectionLabel}>
          {(open ? '▾ ' : '▸ ') + `Stations masquées (${hidden.length})`}
        </Text>
      </Pressable>

      {open
        ? hidden.map((st) => (
            <View key={st.url} style={s.item}>
              <Text style={s.name} numberOfLines={1}>
                {st.name}
              </Text>
              <Text style={s.group}>{st.group}</Text>
              <Pressable
                style={t.btn}
                onPress={() => onRestore(st.url)}
                accessibilityRole="button"
                accessibilityLabel={'Restaurer ' + st.name}>
                <Text style={t.btnText}>↺ RESTAURER</Text>
              </Pressable>
              {st.isCustom ? (
                <Pressable
                  style={t.btn}
                  onPress={() => onPurge(st.url)}
                  accessibilityRole="button"
                  accessibilityLabel={'Supprimer définitivement ' + st.name}>
                  <Text style={[t.btnText, s.danger]}>✕ SUPPRIMER</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: BORDER,
  },
  name: { flex: 1, minWidth: 0, color: DIM, fontSize: 13 },
  group: { color: DIM, fontSize: 9, letterSpacing: 1, opacity: 0.8 },
  danger: { color: RED },
  ghost: { color: GREEN },
});
