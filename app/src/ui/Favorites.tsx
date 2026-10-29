import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Station } from '../model/station';
import { favoriteStations } from '../store/library';
import { FONT_BODY, FONT_DISPLAY, type Palette, useTheme } from './theme';

type Props = {
  /** La bibliothèque entière : le tri (favoris visibles, six au plus) se fait ici. */
  stations: Station[];
  currentUrl: string | null;
  /** Vrai quand la station courante émet, pour distinguer « choisie » de « à l'antenne ». */
  playing?: boolean;
  onSelect: (s: Station) => void;
};

/**
 * Les présélections d'un poste : jusqu'à six gros boutons en tête d'écran, un
 * appui lance la station. Sans favori, rien du tout — pas même une rangée vide
 * qui pousserait la liste vers le bas.
 */
function FavoritesBase({ stations, currentUrl, playing = false, onSelect }: Props) {
  const { p } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const favs = useMemo(() => favoriteStations(stations), [stations]);

  if (!favs.length) return null;

  return (
    <View style={s.wrap} accessibilityLabel="Favoris">
      <Text style={s.label}>── FAVORIS ──</Text>
      <View style={s.grid}>
        {favs.map((st, i) => {
          const active = st.url === currentUrl;
          const on = active && playing;
          return (
            <Pressable
              key={st.url}
              onPress={() => onSelect(st)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={'Favori ' + (i + 1) + ' : ' + st.name}
              style={({ pressed }) => [
                s.btn,
                active && (on ? s.btnOn : s.btnSelected),
                pressed && s.btnPressed,
              ]}>
              <Text style={[s.num, active && s.numActive]}>{i + 1}</Text>
              <Text style={[s.name, active && s.nameActive]} numberOfLines={2}>
                {st.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const Favorites = memo(FavoritesBase);

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    wrap: { paddingHorizontal: 16, paddingBottom: 8 },
    label: {
      color: p.dim,
      fontFamily: FONT_DISPLAY,
      fontSize: 18,
      letterSpacing: 3,
      lineHeight: 22,
      paddingTop: 10,
      paddingBottom: 6,
    },
    // Trois par ligne : deux rangées pour six, des cibles larges au pouce.
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    btn: {
      flexBasis: '30%',
      flexGrow: 1,
      minHeight: 64,
      borderWidth: 1,
      borderColor: p.dim,
      backgroundColor: p.bg3,
      paddingHorizontal: 8,
      paddingVertical: 6,
      justifyContent: 'center',
    },
    btnSelected: { borderColor: p.base },
    btnOn: { borderColor: p.base, backgroundColor: p.bg2 },
    btnPressed: { opacity: 0.7 },
    num: { color: p.dim, fontFamily: FONT_BODY, fontSize: 10 },
    numActive: { color: p.base },
    name: { color: p.bright, fontFamily: FONT_DISPLAY, fontSize: 17, letterSpacing: 1, lineHeight: 19 },
    nameActive: { color: p.base },
  });
