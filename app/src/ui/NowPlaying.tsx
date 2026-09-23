import { useMemo } from 'react';
import Slider from '@react-native-community/slider';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Station } from '../model/station';
import type { StreamState } from '../player/usePlayback';
import { Ticker } from './Ticker';
import { Visualizer } from './Visualizer';
import { FONT_BODY, FONT_DISPLAY, type Palette, useTheme, withAlpha } from './theme';

type Props = {
  station: Station | null;
  /** Pochette validée de la station écoutée, ou null : voir `net/artwork`. */
  artwork: string | null;
  title: string | null;
  playing: boolean;
  streamState: StreamState;
  reconnectAttempt: number;
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

  // Sans fin, la reconnexion doit montrer qu'elle avance : le numéro de
  // l'essai distingue « ça tente encore » de « c'est figé ».
  const status =
    np.streamState === 'reconnecting' && np.reconnectAttempt > 1
      ? `${STREAM_LABEL.reconnecting} ${np.reconnectAttempt}`
      : STREAM_LABEL[np.streamState];
  const disabled = !np.station;

  return (
    <View style={s.wrap}>
      {/* La plaque est posée à gauche des **deux** lignes, comme sur le site :
          dans la seule ligne STATION, elle en décalait le libellé vers la
          droite et laissait NOW PLAYING commencer au bord. */}
      <View style={s.head}>
        {/* Une image en couleurs jurerait au milieu d'un Pip-Boy monochrome :
            niveaux de gris, puis la teinte d'accent en `multiply` — les clairs
            prennent la couleur de l'écran, les sombres virent au noir. Le fond
            de plaque est teinté lui aussi, pour qu'un logo sombre sur fond
            transparent ne se perde pas dans le noir. `contain` et non `cover` :
            beaucoup de ces images sont des bandeaux, qu'un recadrage carré
            couperait en deux. */}
        {np.artwork ? (
          <View style={s.art} importantForAccessibility="no-hide-descendants" accessible={false}>
            <Image source={{ uri: np.artwork }} style={s.artImg} resizeMode="contain" />
            <View style={s.artTint} pointerEvents="none" />
          </View>
        ) : null}
        <View style={s.headText}>
          <View style={s.headRow}>
            <Text style={s.label}>STATION ▸</Text>
            <Text style={s.station} numberOfLines={1}>
              {np.station ? np.station.name : '— SELECT STATION —'}
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
        </View>
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, minWidth: 0 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  art: {
    width: 52,
    height: 52,
    flexShrink: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: p.dim,
    backgroundColor: withAlpha(p.base, 0.22),
    // Le mélange doit rester dans la plaque : sans contexte d'empilement propre,
    // le `multiply` d'Android déborderait sur ce qu'il y a derrière.
    isolation: 'isolate',
  },
  artImg: { width: '100%', height: '100%', filter: [{ grayscale: 1 }, { contrast: 1.15 }, { brightness: 1.1 }] },
  artTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: p.base,
    mixBlendMode: 'multiply',
  },
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
