import Slider from '@react-native-community/slider';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GAIN_MIN, type Station } from '../model/station';
import { BORDER, DIM, GREEN, GREEN_BRIGHT, RED } from './theme';

type Props = {
  station: Station;
  active: boolean;
  playing: boolean;
  nowPlaying?: string;
  onSelect: (s: Station) => void;
  onPreviewGain: (url: string, gain: number) => void;
  onCommitGain: (url: string) => void;
  onHide: (url: string) => void;
};

/**
 * Le curseur de gain et le bouton de masquage sont des éléments frères du bouton
 * de lecture, pas ses enfants : sur le site, les imbriquer dans un élément
 * cliquable les rendait invisibles aux lecteurs d'écran (un bouton aplatit son
 * sous-arbre). Même règle ici, d'où trois contrôles côte à côte.
 */
function StationRowBase({
  station,
  active,
  playing,
  nowPlaying,
  onSelect,
  onPreviewGain,
  onCommitGain,
  onHide,
}: Props) {
  return (
    <View style={[s.row, active && (playing ? s.rowPlaying : s.rowSelected)]}>
      <Pressable
        style={s.main}
        onPress={() => onSelect(station)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={station.name}>
        <Text style={[s.name, active && s.nameActive]} numberOfLines={1}>
          {station.name}
        </Text>
        <Text style={s.np} numberOfLines={1}>
          {nowPlaying ?? '...'}
        </Text>
        <View style={s.gainRow}>
          <Text style={s.gainLabel}>GAIN</Text>
          <Slider
            style={s.slider}
            minimumValue={GAIN_MIN}
            maximumValue={1}
            step={0.01}
            value={station.gain}
            minimumTrackTintColor={GREEN}
            maximumTrackTintColor={BORDER}
            thumbTintColor={GREEN}
            // Audible immédiatement pendant le glissement ; l'écriture dans le
            // stockage attend la fin du geste, une par geste et non une par pixel.
            onValueChange={(v) => onPreviewGain(station.url, v)}
            onSlidingComplete={() => onCommitGain(station.url)}
            accessibilityLabel={'Gain de ' + station.name}
          />
          <Text style={s.gainVal}>{Math.round(station.gain * 100)}%</Text>
        </View>
      </Pressable>

      <View style={s.side}>
        <Text style={s.status}>{active ? (playing ? 'ON AIR' : 'PAUSE') : 'TUNE IN'}</Text>
        <Pressable
          onPress={() => onHide(station.url)}
          accessibilityRole="button"
          accessibilityLabel={'Masquer ' + station.name}
          style={s.hideBtn}>
          <Text style={s.hideTxt}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const StationRow = memo(StationRowBase);

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowPlaying: { borderColor: GREEN },
  rowSelected: { borderColor: DIM },
  main: { flex: 1, minWidth: 0 },
  name: { color: GREEN_BRIGHT, fontSize: 15 },
  nameActive: { color: GREEN },
  np: { color: DIM, fontSize: 11, marginTop: 2 },
  gainRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  gainLabel: { color: DIM, fontSize: 9, letterSpacing: 1 },
  slider: { width: 110, height: 28 },
  gainVal: { color: DIM, fontSize: 9, minWidth: 30 },
  side: { alignItems: 'flex-end', gap: 6, marginLeft: 8 },
  status: { color: DIM, fontSize: 10, letterSpacing: 1 },
  hideBtn: { borderWidth: 1, borderColor: BORDER, paddingHorizontal: 8, paddingVertical: 2 },
  hideTxt: { color: RED, fontSize: 13 },
});
