// Jalon 3 : le confort de lecture par-dessus la bibliothèque.
// Volume maître et sourdine, suivant/précédent (qui sautent les masquées),
// dernière station mémorisée, minuterie de veille avec fondu, reconnexion sur
// flux coupé, et le titre en cours de toutes les stations et non plus seulement
// de celle qu'on écoute.
// Reste à faire : l'habillage Pip-Boy, l'annuaire Radio-Browser, les raccourcis
// clavier de la cible web.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, SectionList, StatusBar, StyleSheet, Text, View } from 'react-native';

import type { Station } from './src/model/station';
import { useNowPlaying } from './src/model/useNowPlaying';
import { setupPlayer } from './src/player/player';
import { usePlayback } from './src/player/usePlayback';
import { groupStations, knownGroups } from './src/store/library';
import { useLibrary } from './src/store/useLibrary';
import { AddStation } from './src/ui/AddStation';
import { NowPlaying } from './src/ui/NowPlaying';
import { StationRow } from './src/ui/StationRow';
import { Trash } from './src/ui/Trash';
import { BG, GREEN, t } from './src/ui/theme';

export default function App() {
  const lib = useLibrary();
  const play = usePlayback(lib.stations);
  const { titles, refreshOne } = useNowPlaying(lib.stations, play.currentUrl);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const onSelect = useCallback(
    (s: Station) => {
      play.select(s);
      // Une station au-delà du plafond de sondage n'a pas de titre : on va le
      // chercher pour elle seule au moment où on la choisit.
      if (!titles[s.url]) void refreshOne(s.url);
    },
    [play, refreshOne, titles],
  );

  // Masquer la station écoutée l'arrête : elle sort de la liste, la laisser
  // jouer depuis la corbeille n'aurait aucun sens.
  const onHide = useCallback(
    (url: string) => {
      if (play.currentUrl === url) play.stop();
      lib.hide(url);
    },
    [lib, play],
  );

  const rowStatus = useCallback(
    (url: string) => {
      if (url !== play.currentUrl) return 'TUNE IN';
      if (play.playing) return 'ON AIR';
      // Rien n'est attaché tant qu'on n'a pas appuyé sur lecture : après une
      // restauration, la station est sélectionnée, pas en pause.
      return play.streamState === 'idle' ? 'TUNE IN' : 'PAUSE';
    },
    [play.currentUrl, play.playing, play.streamState],
  );

  const sections = useMemo(() => groupStations(lib.stations), [lib.stations]);
  const hidden = useMemo(() => lib.stations.filter((x) => x.hidden), [lib.stations]);
  const groups = useMemo(() => knownGroups(lib.stations), [lib.stations]);

  return (
    <SafeAreaView style={t.screen}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <Text style={t.title}>FALLOUT RADIO</Text>

      {error ? <Text style={[t.msgErr, s.pad]}>⚠ {error}</Text> : null}

      <NowPlaying
        station={play.current}
        title={play.current ? (titles[play.current.url] ?? null) : null}
        playing={play.playing}
        streamState={play.streamState}
        master={play.master}
        muted={play.muted}
        sleepMinutes={play.sleepMinutes}
        sleepLeft={play.sleepLeft}
        onToggle={play.toggle}
        onStop={play.stop}
        onNext={play.next}
        onPrevious={play.previous}
        onChangeMaster={play.changeMaster}
        onCommitMaster={play.commitMaster}
        onToggleMute={play.toggleMute}
        onCycleSleep={play.cycleSleep}
      />

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
              active={item.url === play.currentUrl}
              status={rowStatus(item.url)}
              nowPlaying={titles[item.url]}
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
  loader: { marginTop: 32 },
  footerSpace: { height: 28 },
});
