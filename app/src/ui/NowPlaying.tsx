import Slider from '@react-native-community/slider';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Station } from '../model/station';
import type { StreamState } from '../player/usePlayback';
import { BORDER, DIM, GREEN, GREEN_BRIGHT, RED, t } from './theme';

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
      <Text style={s.station} numberOfLines={1}>
        {p.station ? p.station.name : '— SELECT A STATION —'}
      </Text>
      {/* Le titre et l'état du flux passent par une région vivante : ce sont les
          seuls changements que rien d'autre n'annonce. */}
      <Text style={s.song} numberOfLines={1} accessibilityLiveRegion="polite">
        {status || (p.station ? (p.title ?? '...') : ' ')}
      </Text>

      <View style={s.controls}>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={p.onPrevious}
          accessibilityRole="button"
          accessibilityLabel="Station précédente">
          <Text style={[t.btnText, disabled && t.btnOff]}>◀◀</Text>
        </Pressable>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={p.onToggle}
          accessibilityRole="button"
          accessibilityLabel={p.playing ? 'Pause' : 'Lecture'}>
          <Text style={[t.btnText, disabled && t.btnOff]}>{p.playing ? '❚❚' : '▶'}</Text>
        </Pressable>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={p.onStop}
          accessibilityRole="button"
          accessibilityLabel="Arrêter">
          <Text style={[t.btnText, disabled && t.btnOff]}>■</Text>
        </Pressable>
        <Pressable
          style={t.btn}
          disabled={disabled}
          onPress={p.onNext}
          accessibilityRole="button"
          accessibilityLabel="Station suivante">
          <Text style={[t.btnText, disabled && t.btnOff]}>▶▶</Text>
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
          minimumTrackTintColor={p.muted ? DIM : GREEN}
          maximumTrackTintColor={BORDER}
          thumbTintColor={p.muted ? DIM : GREEN}
          onValueChange={p.onChangeMaster}
          onSlidingComplete={p.onCommitMaster}
          accessibilityLabel="Volume général"
        />
        <Text style={s.volVal}>{Math.round((p.muted ? 0 : p.master) * 100)}%</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: DIM, margin: 16, marginBottom: 8, padding: 12 },
  station: { color: GREEN, fontSize: 15, letterSpacing: 2 },
  song: { color: GREEN_BRIGHT, fontSize: 11, marginTop: 4, opacity: 0.8 },
  controls: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  armed: { borderColor: GREEN },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  volLabel: { color: DIM, fontSize: 10, letterSpacing: 1 },
  slider: { flex: 1, height: 28 },
  volVal: { color: DIM, fontSize: 10, minWidth: 34, textAlign: 'right' },
  mutedTxt: { color: RED },
});
