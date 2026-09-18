import Slider from '@react-native-community/slider';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GAIN_MIN, type Station } from '../model/station';
import { StationDot } from './StationDot';
import { FONT_BODY, FONT_DISPLAY, type Palette, useTheme } from './theme';

type Props = {
  station: Station;
  active: boolean;
  /** Libellé d'état, décidé par l'écran : lui seul sait si le flux est attaché. */
  status: string;
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
 * sous-arbre), et ici le centre de la zone de clic tombait sur le curseur.
 */
function StationRowBase({
  station,
  active,
  status,
  nowPlaying,
  onSelect,
  onPreviewGain,
  onCommitGain,
  onHide,
}: Props) {
  const { p: p } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);

  const playing = status === 'ON AIR';

  return (
    <View style={[s.row, active && (playing ? s.rowPlaying : s.rowSelected)]}>
      <StationDot playing={playing} selected={active} />

      <View style={s.main}>
        <Pressable
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
        </Pressable>

        <View style={s.gainRow}>
          <Text style={s.gainLabel}>GAIN</Text>
          <Slider
            style={s.slider}
            minimumValue={GAIN_MIN}
            maximumValue={1}
            step={0.01}
            value={station.gain}
            minimumTrackTintColor={p.base}
            maximumTrackTintColor={p.border}
            thumbTintColor={p.base}
            // Audible immédiatement pendant le glissement ; l'écriture dans le
            // stockage attend la fin du geste, une par geste et non une par pixel.
            onValueChange={(v) => onPreviewGain(station.url, v)}
            onSlidingComplete={() => onCommitGain(station.url)}
            accessibilityLabel={'Gain de ' + station.name}
          />
          <Text style={s.gainVal}>{Math.round(station.gain * 100)}%</Text>
        </View>
      </View>

      <View style={s.side}>
        <Text style={[s.status, playing && s.statusOn]}>{playing ? '■ ' + status : '▶ ' + status}</Text>
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

const makeStyles = (p: Palette) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: p.border,
    backgroundColor: p.bg3,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowPlaying: { borderColor: p.base, backgroundColor: p.bg2 },
  rowSelected: { borderColor: p.dim },
  main: { flex: 1, minWidth: 0 },
  name: { color: p.bright, fontFamily: FONT_DISPLAY, fontSize: 19, letterSpacing: 1, lineHeight: 23 },
  nameActive: { color: p.base },
  np: { color: p.dim, fontFamily: FONT_BODY, fontSize: 11, marginTop: 1 },
  gainRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  gainLabel: { color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1 },
  slider: { width: 110, height: 28 },
  gainVal: { color: p.dim, fontFamily: FONT_BODY, fontSize: 10, minWidth: 32 },
  side: { alignItems: 'flex-end', gap: 6, marginLeft: 8 },
  status: { color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 13, letterSpacing: 1 },
  statusOn: { color: p.base },
  hideBtn: { borderWidth: 1, borderColor: p.border, paddingHorizontal: 8, paddingVertical: 1 },
  hideTxt: { color: p.red, fontFamily: FONT_DISPLAY, fontSize: 15, lineHeight: 18 },
});
