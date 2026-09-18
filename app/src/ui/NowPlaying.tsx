import { useMemo } from 'react';
import Slider from '@react-native-community/slider';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Station } from '../model/station';
import type { StreamState } from '../player/usePlayback';
import { Ticker } from './Ticker';
import { Visualizer } from './Visualizer';
import { FONT_BODY, FONT_DISPLAY, type Palette, useTheme } from './theme';

type Props = {
  station: Station | null;
  title: string | null;
  playing: boolean;
  streamState: StreamState;
  master: number;
  muted: boolean;
  sleepMinutes: number;
  sleepLeft: number | null;
  onToggle: () => void;
  onStop: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onChangeMaster: (v: number) => void;
  onCommitMaster: (v: number) => void;
  onToggleMute: () => void;
  onCycleSleep: () => void;
};

/** Les états transitoires du flux, avec les mêmes mots que sur le site. */
const STREAM_LABEL: Record<StreamState, string> = {
  idle: '',
  buffering: '⟳ TAMPON…',
  playing: '',
  reconnecting: '⟳ RECONNEXION…',
  dropped: '⚠ FLUX INTERROMPU',
};

function sleepLabel(minutes: number, left: number | null): string {
  if (!minutes) return '⏱ VEILLE';
  if (left == null) return `⏱ ${minutes} MIN`;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `⏱ ${m}:${String(s).padStart(2, '0')}`;
}

export function NowPlaying(np: Props) {
  const { p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);

  const status = STREAM_LABEL[np.streamState];
  const disabled = !np.station;

  return (
    <View style={s.wrap}>
      <View style={s.headRow}>
        <Text style={s.label}>STATION ▸</Text>
        <Text style={s.station} numberOfLines={1}>
          {np.station ? np.station.name : '— SELECT A STATION —'}
        </Text>
      </View>

      <View style={s.headRow}>
        <Text style={s.label}>NOW PLAYING ▸</Text>
        {status ? (
          <Text style={s.status} accessibilityLiveRegion="polite">
            {status}
          </Text>
        ) : (
          // Le ticker mesure sa boîte pour savoir s il doit défiler : sans
          // largeur, il se mesurerait à zéro et son overflow le masquerait.
          <View style={s.tickerBox}>
            <Ticker text={np.station ? (np.title ?? '...') : '—'} style={s.song} />
          </View>
        )}
      </View>

      <View style={s.controls}>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={np.onPrevious}
          accessibilityRole="button"
          accessibilityLabel="Station précédente">
          <Text style={[t.btnText, disabled && t.btnOff]}>◀◀ PREV</Text>
        </Pressable>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={np.onToggle}
          accessibilityRole="button"
          accessibilityLabel={np.playing ? 'Pause' : 'Lecture'}>
          <Text style={[t.btnText, disabled && t.btnOff]}>{np.playing ? '❚❚ PAUSE' : '▶ PLAY'}</Text>
        </Pressable>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={np.onStop}
          accessibilityRole="button"
          accessibilityLabel="Arrêter">
          <Text style={[t.btnText, disabled && t.btnOff]}>■ STOP</Text>
        </Pressable>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={np.onNext}
          accessibilityRole="button"
          accessibilityLabel="Station suivante">
          <Text style={[t.btnText, disabled && t.btnOff]}>NEXT ▶▶</Text>
        </Pressable>
        <Pressable
          style={[t.btn, np.sleepMinutes ? s.armed : null]}
          onPress={np.onCycleSleep}
          accessibilityRole="button"
          accessibilityLabel={
            np.sleepMinutes ? `Minuterie de veille, ${np.sleepMinutes} minutes` : 'Minuterie de veille'
          }>
          <Text style={t.btnText}>{sleepLabel(np.sleepMinutes, np.sleepLeft)}</Text>
        </Pressable>
      </View>

      {/* Le volume général n'a pas lieu d'être sur un téléphone : les touches
          physiques le font déjà, et un second réglage en série avec le premier
          ne fait que compliquer le dosage. Le gain par station, lui, reste : il
          règle l'équilibre entre stations, pas le niveau de sortie. */}
      {Platform.OS === 'web' ? (
      <View style={s.volRow}>
        <Pressable
          onPress={np.onToggleMute}
          accessibilityRole="button"
          accessibilityState={{ checked: np.muted }}
          accessibilityLabel={np.muted ? 'Rétablir le son' : 'Couper le son'}
          style={t.btn}>
          <Text style={[t.btnText, np.muted && s.mutedTxt]}>{np.muted ? '🔇' : '🔊'}</Text>
        </Pressable>
        <Text style={s.volLabel}>VOL</Text>
        <Slider
          style={s.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          value={np.master}
          minimumTrackTintColor={np.muted ? p.dim : p.base}
          maximumTrackTintColor={p.border}
          thumbTintColor={np.muted ? p.dim : p.base}
          onValueChange={np.onChangeMaster}
          onSlidingComplete={np.onCommitMaster}
          accessibilityLabel="Volume général"
        />
        <Text style={s.volVal}>{Math.round((np.muted ? 0 : np.master) * 100)}%</Text>
      </View>
      ) : null}

      <Visualizer active={np.playing} />
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: p.dim,
    backgroundColor: p.bg2,
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tickerBox: { flex: 1, minWidth: 0 },
  label: { color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 2, lineHeight: 17 },
  station: {
    flex: 1,
    color: p.base,
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    letterSpacing: 2,
    lineHeight: 26,
  },
  song: { color: p.base, fontFamily: FONT_BODY, fontSize: 12 },
  status: { flex: 1, color: p.base, fontFamily: FONT_BODY, fontSize: 12 },
  controls: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  armed: { borderColor: p.base },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  volLabel: { color: p.dim, fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 2 },
  slider: { flex: 1, height: 28 },
  volVal: { color: p.dim, fontFamily: FONT_BODY, fontSize: 11, minWidth: 36, textAlign: 'right' },
  mutedTxt: { color: p.red },
});
