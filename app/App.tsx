// Jalon 2 : la bibliothèque. Liste groupée, gain par station, corbeille, ajout
// manuel, import/export, le tout persisté.
// L'habillage Pip-Boy (scanline, flicker, ticker, polices VT323) reste à faire,
// comme le sondage des titres de toutes les stations — ici seule la station
// écoutée est sondée.

import { useIsPlaying } from '@rntp/player';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { fetchMeta } from './src/model/meta';
import type { Station } from './src/model/station';
import { playStation, setVolume, setupPlayer, stop, togglePlay } from './src/player/player';
import { groupStations, knownGroups } from './src/store/library';
import { useLibrary } from './src/store/useLibrary';
import { AddStation } from './src/ui/AddStation';
import { StationRow } from './src/ui/StationRow';
import { Trash } from './src/ui/Trash';
import { BG, DIM, GREEN, t } from './src/ui/theme';

const MASTER_VOLUME = 0.7;

export default function App() {
  const lib = useLibrary();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const playing = useIsPlaying();

  // setupPlayer() est synchrone en v5 (appels natifs via JSI), mais toujours à
  // n'appeler qu'au premier plan côté Android.
  useEffect(() => {
    try {
      setupPlayer();
      setReady(true);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }, []);

  const current = useMemo(
    () => lib.stations.find((s) => s.url === currentUrl) ?? null,
    [lib.stations, currentUrl],
  );

  // Le gain se règle pendant la lecture : le volume effectif suit le curseur de
  // la station écoutée, sinon le réglage ne s'entendrait qu'au prochain zapping.
  useEffect(() => {
    if (current) setVolume(current, MASTER_VOLUME);
  }, [current]);

  // Titre en cours, pour la station écoutée seulement tant que le sondage
  // groupé (40 stations par tour sur le site) n'est pas porté.
  useEffect(() => {
    const meta = current?.meta;
    const url = current?.url;
    if (!meta || !url) {
      setNowPlaying(null);
      return;
    }
    let alive = true;
    const poll = async () => {
      const txt = await fetchMeta(meta, url);
      if (alive) setNowPlaying(txt);
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [current?.url]);

  const onSelect = useCallback(
    (s: Station) => {
      if (currentUrl === s.url) {
        togglePlay(playing);
        return;
      }
      setCurrentUrl(s.url);
      playStation(s, MASTER_VOLUME);
    },
    [currentUrl, playing],
  );

  const onStop = useCallback(() => {
    stop();
    setCurrentUrl(null);
  }, []);

  // Masquer la station écoutée l'arrête : elle sort de la liste, la laisser
  // jouer depuis la corbeille n'aurait aucun sens.
  const onHide = useCallback(
    (url: string) => {
      if (currentUrl === url) onStop();
      lib.hide(url);
    },
    [currentUrl, lib, onStop],
  );

  const sections = useMemo(() => groupStations(lib.stations), [lib.stations]);
  const hidden = useMemo(() => lib.stations.filter((x) => x.hidden), [lib.stations]);
  const groups = useMemo(() => knownGroups(lib.stations), [lib.stations]);

  return (
    <SafeAreaView style={t.screen}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <Text style={t.title}>FALLOUT RADIO</Text>

      {error ? <Text style={[t.msgErr, s.pad]}>⚠ {error}</Text> : null}

      <View style={s.np}>
        <Text style={s.npStation} numberOfLines={1}>
          {current ? current.name : '— SELECT A STATION —'}
        </Text>
        <Text style={s.npSong} numberOfLines={1} accessibilityLiveRegion="polite">
          {current ? (nowPlaying ?? '...') : ' '}
        </Text>
      </View>

      {lib.loading || !ready ? (
        <ActivityIndicator color={GREEN} style={s.loader} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.url}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => <Text style={t.sectionLabel}>{section.title}</Text>}
          renderItem={({ item }) => (
            <StationRow
              station={item}
              active={item.url === currentUrl}
              playing={playing}
              nowPlaying={item.url === currentUrl ? (nowPlaying ?? undefined) : undefined}
              onSelect={onSelect}
              onPreviewGain={lib.previewGain}
              onCommitGain={lib.commitGain}
              onHide={onHide}
            />
          )}
          ListFooterComponent={
            <View>
              <Trash hidden={hidden} onRestore={lib.restore} onPurge={lib.purge} />
              <AddStation
                groups={groups}
                onAdd={lib.addStation}
                onExport={lib.exportStations}
                onImport={lib.importStations}
              />
              <View style={s.footerSpace} />
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  np: { borderWidth: 1, borderColor: DIM, margin: 16, marginBottom: 8, padding: 12 },
  npStation: { color: GREEN, fontSize: 15, letterSpacing: 2 },
  npSong: { color: DIM, fontSize: 11, marginTop: 4 },
  loader: { marginTop: 32 },
  footerSpace: { height: 28 },
});
