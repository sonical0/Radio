// Jalon 5 : l'habillage Pip-Boy — polices VT323 et Share Tech Mono, trame de
// balayage, vacillement, visualiseur, ticker, horloge, pastille qui pulse.
// Avec les raccourcis clavier de la cible web, la parité fonctionnelle avec le
// site est atteinte.

import { useFonts } from 'expo-font';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { publishWidgetState } from './modules/player-widget';
import type { Alarm } from './modules/alarm';
import type { Station } from './src/model/station';
import { useNowPlaying } from './src/model/useNowPlaying';
import { useUpdateCheck } from './src/model/useUpdateCheck';
import { setupPlayer } from './src/player/player';
import { useKeyboardShortcuts } from './src/player/useKeyboardShortcuts';
import { usePlayback } from './src/player/usePlayback';
import { useAlarms } from './src/store/useAlarms';
import { groupStations, knownGroups } from './src/store/library';
import { useLibrary } from './src/store/useLibrary';
import { AddStation } from './src/ui/AddStation';
import { Bedside } from './src/ui/Bedside';
import { Clock } from './src/ui/Clock';
import { Crt } from './src/ui/Crt';
import { Directory } from './src/ui/Directory';
import { NowPlaying } from './src/ui/NowPlaying';
import { StationRow } from './src/ui/StationRow';
import { Trash } from './src/ui/Trash';
import { UpdateBanner } from './src/ui/UpdateBanner';
import { Settings } from './src/ui/Settings';
import { FONTS, FONT_BODY, ThemeProvider, useTheme, type Palette } from './src/ui/theme';

/** Sans accents ni casse : chercher « agatha » doit trouver « Agatha's Station ». */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export default function App() {
  // Le thème est au-dessus de tout : la couleur d écran change jusqu au fond
  // de la barre système et à la trame du tube.
  return (
    <ThemeProvider>
      <Radio />
    </ThemeProvider>
  );
}

function Radio() {
  const { p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Hauteur du clavier. Android 15 impose le bord-à-bord, et dans ce mode
  // adjustResize ne redimensionne plus la fenêtre : c est à l appli de faire
  // de la place, sinon le champ saisi reste sous le clavier.
  const [keyboard, setKeyboard] = useState(0);
  const listRef = useRef<SectionList<Station>>(null);
  // Les champs de saisie vivent tous dans le pied de liste : amener la liste
  // à son terme place donc le champ visé juste au-dessus du clavier, une fois
  // la marge de sa hauteur appliquée. Le délai laisse ce rendu se faire.
  const onFieldFocus = useCallback(() => {
    setTimeout(() => listRef.current?.getScrollResponder()?.scrollToEnd({ animated: true }), 120);
  }, []);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const lib = useLibrary();
  const play = usePlayback(lib.stations);
  const { titles, refreshOne } = useNowPlaying(lib.stations, play.currentUrl);
  const [fontsLoaded] = useFonts(FONTS);
  const updates = useUpdateCheck();
  const alarms = useAlarms();
  useKeyboardShortcuts(play);
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

  // Le widget d'écran d'accueil ne peut pas interroger l'application : il
  // dessine ce qu'on lui a laissé. On republie à chaque changement visible,
  // et c'est la seule chose que le JS lui doit — ses boutons, eux, passent
  // par la session média et n'ont besoin de personne.
  const current = play.current;
  const currentTitle = current ? (titles[current.url] ?? '') : '';
  useEffect(() => {
    publishWidgetState(current?.name ?? '', currentTitle, play.playing);
  }, [current?.name, currentTitle, play.playing]);

  // Sauvegarde et restauration : les stations ajoutées **et** les réveils.
  // Le fichier v1 ne portait que les stations, et changer de téléphone perdait
  // les alarmes sans rien dire.
  const onExport = useCallback(() => lib.exportStations(alarms.alarms), [alarms.alarms, lib]);
  const onImport = useCallback(
    () =>
      lib.importStations((raw) => {
        const list = raw.filter(
          (a): a is Alarm =>
            !!a && typeof a === 'object' && typeof (a as Alarm).id === 'string',
        );
        // Une alarme importée arrive éteinte : on ne réveille personne à 7 h
        // parce qu'il a restauré une sauvegarde la veille au soir.
        for (const a of list) alarms.save({ ...a, enabled: false });
        return list.length;
      }),
    [alarms, lib],
  );

  // Le paysage n'est pas une mise en page de plus : c'est un autre écran.
  // Poser le téléphone à l'horizontale en fait un radio-réveil, et la liste
  // des stations n'a pas à savoir ce qu'elle deviendrait dans cette largeur.
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  // Onze stations tiennent à l'œil ; l'annuaire Radio-Browser en propose
  // cinquante mille, et dès qu'on en ajoute vingt la liste devient un mur.
  // Le filtre ne touche que l'affichage : la file du lecteur, donc le zapping,
  // continue de parcourir toute la bibliothèque.
  const [query, setQuery] = useState('');
  const matching = useMemo(() => {
    const q = normalize(query);
    if (!q) return lib.stations;
    // Les masquées restent écartées ici comme ailleurs : la corbeille a son
    // propre volet, et une recherche qui ressort ce qu'on a jeté surprend.
    return lib.stations.filter(
      (s) => s.hidden || normalize(s.name).includes(q) || normalize(s.group).includes(q),
    );
  }, [lib.stations, query]);

  const sections = useMemo(() => groupStations(matching), [matching]);
  const hidden = useMemo(() => lib.stations.filter((x) => x.hidden), [lib.stations]);
  const groups = useMemo(() => knownGroups(lib.stations), [lib.stations]);

  if (landscape) {
    return (
      <SafeAreaProvider>
        <Crt>
          <SafeAreaView style={t.screen} edges={['top', 'bottom', 'left', 'right']}>
            <StatusBar hidden />
            <Bedside
              station={play.current}
              title={currentTitle || null}
              lib={alarms}
              playing={play.playing}
              streamState={play.streamState}
              onToggle={play.toggle}
            />
          </SafeAreaView>
        </Crt>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <Crt>
        <KeyboardAvoidingView
          style={t.screen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={t.screen} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor={p.bg} />

        <View style={t.header}>
          <Text style={t.title} numberOfLines={1}>FALLOUT RADIO</Text>
          <View style={s.headerRight}>
            <Pressable
              onPress={() => setSettingsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Réglages"
              style={t.btn}>
              <Text style={t.btnText}>⚙</Text>
            </Pressable>
            <Clock />
          </View>
        </View>

        <Settings
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          update={updates.update}
          checking={updates.checking}
          onCheckUpdate={updates.check}
        />

        <UpdateBanner update={updates.update} onDismiss={updates.dismiss} />

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

        {lib.loading || !ready || !fontsLoaded ? (
          <ActivityIndicator color={p.base} style={s.loader} />
        ) : (
          <SectionList
            ref={listRef}
            sections={sections}
            ListHeaderComponent={
              lib.stations.filter((x) => !x.hidden).length > 8 ? (
                <View style={s.search}>
                  <TextInput
                    style={[t.input, s.searchField]}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="CHERCHER UNE STATION"
                    placeholderTextColor={p.dim}
                    accessibilityLabel="Chercher une station"
                    autoCorrect={false}
                  />
                  {query ? (
                    <Pressable
                      onPress={() => setQuery('')}
                      accessibilityRole="button"
                      accessibilityLabel="Effacer la recherche"
                      style={t.btn}>
                      <Text style={t.btnText}>✕</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null
            }
            keyExtractor={(item) => item.url}
            stickySectionHeadersEnabled={false}
            // Sans ça, le premier appui ne sert qu à fermer le clavier et le
            // bouton visé ne reçoit rien.
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: keyboard }}
            renderSectionHeader={({ section }) => (
              <Text style={t.sectionLabel}>{'── ' + section.title + ' ──'}</Text>
            )}
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
                  onExport={onExport}
                  onImport={onImport}
                  onFieldFocus={onFieldFocus}
                />
                <Directory onAdd={lib.addStation} onFieldFocus={onFieldFocus} />
                {/* Les raccourcis n existent que sur la cible web : ne pas les
                    annoncer sur un téléphone, qui n a pas de clavier. */}
                {Platform.OS === 'web' ? (
                  <Text style={s.shortcuts}>
                    ESPACE lecture/pause · ← → station · ↑ ↓ volume · M muet · S stop
                  </Text>
                ) : null}
                <View style={s.footerSpace} />
              </View>
            }
          />
        )}
        </SafeAreaView>
        </KeyboardAvoidingView>
      </Crt>
    </SafeAreaProvider>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  loader: { marginTop: 32 },
  shortcuts: {
    color: p.dim,
    fontFamily: FONT_BODY,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 18,
    marginHorizontal: 16,
    opacity: 0.8,
  },
  footerSpace: { height: 28 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  searchField: { flex: 1, marginBottom: 0 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  });
