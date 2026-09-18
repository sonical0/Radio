import Slider from '@react-native-community/slider';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Station } from '../model/station';
import type { StreamState } from '../player/usePlayback';
import { Ticker } from './Ticker';
import { Visualizer } from './Visualizer';
import {
  BG2,
  BORDER,
  FONT_BODY,
  FONT_DISPLAY,
  GREEN,
  GREEN_DIM,
  RED,
  t,
} from './theme';

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

export function NowPlaying(p: Props) {
  const status = STREAM_LABEL[p.streamState];
  const disabled = !p.station;

  return (
    <View style={s.wrap}>
      <View style={s.headRow}>
        <Text style={s.label}>STATION ▸</Text>
        <Text style={s.station} numberOfLines={1}>
          {p.station ? p.station.name : '— SELECT A STATION —'}
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
            <Ticker text={p.station ? (p.title ?? '...') : '—'} style={s.song} />
          </View>
        )}
      </View>

      <View style={s.controls}>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={p.onPrevious}
          accessibilityRole="button"
          accessibilityLabel="Station précédente">
          <Text style={[t.btnText, disabled && t.btnOff]}>◀◀ PREV</Text>
        </Pressable>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={p.onToggle}
          accessibilityRole="button"
          accessibilityLabel={p.playing ? 'Pause' : 'Lecture'}>
          <Text style={[t.btnText, disabled && t.btnOff]}>{p.playing ? '❚❚ PAUSE' : '▶ PLAY'}</Text>
        </Pressable>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={p.onStop}
          accessibilityRole="button"
          accessibilityLabel="Arrêter">
          <Text style={[t.btnText, disabled && t.btnOff]}>■ STOP</Text>
        </Pressable>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={p.onNext}
          accessibilityRole="button"
          accessibilityLabel="Station suivante">
          <Text style={[t.btnText, disabled && t.btnOff]}>NEXT ▶▶</Text>
        </Pressable>
        <Pressable
          style={[t.btn, p.sleepMinutes ? s.armed : null]}
          onPress={p.onCycleSleep}
          accessibilityRole="button"
          accessibilityLabel={
            p.sleepMinutes ? `Minuterie de veille, ${p.sleepMinutes} minutes` : 'Minuterie de veille'
          }>
          <Text style={t.btnText}>{sleepLabel(p.sleepMinutes, p.sleepLeft)}</Text>
        </Pressable>
      </View>

      <View style={s.volRow}>
        <Pressable
          onPress={p.onToggleMute}
          accessibilityRole="button"
          accessibilityState={{ checked: p.muted }}
          accessibilityLabel={p.muted ? 'Rétablir le son' : 'Couper le son'}
          style={t.btn}>
          <Text style={[t.btnText, p.muted && s.mutedTxt]}>{p.muted ? '🔇' : '🔊'}</Text>
        </Pressable>
        <Text style={s.volLabel}>VOL</Text>
        <Slider
          style={s.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          value={p.master}
          minimumTrackTintColor={p.muted ? GREEN_DIM : GREEN}
          maximumTrackTintColor={BORDER}
          thumbTintColor={p.muted ? GREEN_DIM : GREEN}
          onValueChange={p.onChangeMaster}
          onSlidingComplete={p.onCommitMaster}
          accessibilityLabel="Volume général"
        />
        <Text style={s.volVal}>{Math.round((p.muted ? 0 : p.master) * 100)}%</Text>
      </View>

      <Visualizer active={p.playing} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: GREEN_DIM,
    backgroundColor: BG2,
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tickerBox: { flex: 1, minWidth: 0 },
  label: { color: GREEN_DIM, fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 2, lineHeight: 17 },
  station: {
    flex: 1,
    color: GREEN,
    fontFamily: FONT_DISPLAY,
    fontSize: 22,
    letterSpacing: 2,
    lineHeight: 26,
  },
  song: { color: GREEN, fontFamily: FONT_BODY, fontSize: 12 },
  status: { flex: 1, color: GREEN, fontFamily: FONT_BODY, fontSize: 12 },
  controls: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  armed: { borderColor: GREEN },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  volLabel: { color: GREEN_DIM, fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 2 },
  slider: { flex: 1, height: 28 },
  volVal: { color: GREEN_DIM, fontFamily: FONT_BODY, fontSize: 11, minWidth: 36, textAlign: 'right' },
  mutedTxt: { color: RED },
});
