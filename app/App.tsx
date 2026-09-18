// Jalon 1 : faire sortir du son, en arrière-plan, avec les contrôles système.
// L'habillage Pip-Boy (scanline, flicker, ticker, polices VT323) vient ensuite —
// ici, juste assez de vert sur noir pour ne pas tester dans le blanc.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsPlaying } from 'react-native-track-player';

import rawStations from './src/data/stations.json';
import { fetchMeta } from './src/model/meta';
import { isValidStation, normalizeStation, type Station } from './src/model/station';
import { playStation, setupPlayer, stop, togglePlay } from './src/player/player';

const MASTER_VOLUME = 0.7;

const STATIONS: Station[] = (rawStations as unknown[])
  .filter(isValidStation)
  .map((s) => normalizeStation(s, false));

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Station | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const { playing } = useIsPlaying();

  useEffect(() => {
    setupPlayer()
      .then(() => setReady(true))
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  // Le titre en cours, uniquement pour la station écoutée tant que la liste n'est
  // pas là : le sondage des 11 stations à la fois viendra avec elle.
  useEffect(() => {
    if (!current?.meta) {
      setNowPlaying(null);
      return;
    }
    let alive = true;
    const poll = async () => {
      const txt = await fetchMeta(current.meta!, current.url);
      if (alive) setNowPlaying(txt);
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [current]);

  const onSelect = async (s: Station) => {
    if (current?.url === s.url) {
      await togglePlay(!!playing);
      return;
    }
    setCurrent(s);
    await playStation(s, MASTER_VOLUME);
  };

  const onStop = async () => {
    await stop();
    setCurrent(null);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f0a" />
      <Text style={styles.title}>FALLOUT RADIO</Text>

      {error ? <Text style={styles.error}>⚠ {error}</Text> : null}

      <View style={styles.np}>
        <Text style={styles.npStation}>{current ? current.name : '— SELECT A STATION —'}</Text>
        <Text style={styles.npSong} numberOfLines={1} accessibilityLiveRegion="polite">
          {current ? nowPlaying ?? '...' : ' '}
        </Text>
        <View style={styles.controls}>
          <Pressable
            style={styles.btn}
            disabled={!current}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Lecture'}
            onPress={() => togglePlay(!!playing)}>
            <Text style={[styles.btnText, !current && styles.btnOff]}>
              {playing ? '❚❚ PAUSE' : '▶ PLAY'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.btn}
            disabled={!current}
            accessibilityRole="button"
            accessibilityLabel="Arrêter"
            onPress={onStop}>
            <Text style={[styles.btnText, !current && styles.btnOff]}>■ STOP</Text>
          </Pressable>
        </View>
      </View>

      {!ready && !error ? (
        <ActivityIndicator color="#39ff6a" style={styles.loader} />
      ) : (
        <FlatList
          data={STATIONS}
          keyExtractor={(s) => s.url}
          renderItem={({ item }) => {
            const active = current?.url === item.url;
            return (
              <Pressable
                style={[styles.row, active && styles.rowActive]}
                onPress={() => onSelect(item)}
                // Sans ces deux props, RN Web rend un <div> muet : le site web, lui,
                // expose un vrai <button aria-pressed>. On ne perd pas la passe
                // d'accessibilité du 15/09 en changeant de socle.
                accessibilityRole="button"
                accessibilityState={{ selected: active, busy: active && !playing }}
                accessibilityLabel={item.name + ', ' + item.group}>
                <Text style={styles.group}>{item.group}</Text>
                <Text style={[styles.name, active && styles.nameActive]}>{item.name}</Text>
                <Text style={styles.status}>{active ? (playing ? 'ON AIR' : 'PAUSE') : 'TUNE IN'}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const GREEN = '#39ff6a';
const DIM = '#1f7a3a';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0f0a', paddingHorizontal: 16, paddingTop: 24 },
  title: { color: GREEN, fontSize: 24, letterSpacing: 4, marginBottom: 12 },
  error: { color: '#ff6b6b', marginBottom: 8 },
  np: { borderWidth: 1, borderColor: DIM, padding: 12, marginBottom: 16 },
  npStation: { color: GREEN, fontSize: 16, letterSpacing: 2 },
  npSong: { color: DIM, fontSize: 12, marginTop: 4 },
  controls: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { borderWidth: 1, borderColor: DIM, paddingVertical: 6, paddingHorizontal: 14 },
  btnText: { color: GREEN, letterSpacing: 1 },
  btnOff: { color: DIM },
  loader: { marginTop: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#14301c',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  rowActive: { borderColor: GREEN },
  group: { color: DIM, fontSize: 10, width: 42, letterSpacing: 1 },
  name: { color: '#8fffb0', flex: 1 },
  nameActive: { color: GREEN },
  status: { color: DIM, fontSize: 10, letterSpacing: 1 },
});
