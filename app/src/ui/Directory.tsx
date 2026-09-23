import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  countryQuery,
  isRbOrder,
  loadCountries,
  loadTags,
  normalizeSearch,
  RB_ORDER_DEFAULT,
  RB_ORDER_IDS,
  RB_ORDERS,
  runDirectoryQuery,
  searchQuery,
  tagQuery,
  type BrowseEntry,
  type DirectoryHit,
  type DirectoryQuery,
  type RbOrder,
} from '../net/directory';
import { KEY_RB_ORDER, KEY_RB_PINNED, readJson, readString, writeJson, writeString } from '../store/storage';
import type { Outcome } from '../store/useLibrary';
import { FONT_BODY, type Palette, useTheme } from './theme';

type Props = {
  onAdd: (raw: {
    name: string;
    group: string;
    url: string;
    uuid?: string | null;
    favicon?: string | null;
  }) => Promise<Outcome>;
  onFieldFocus: () => void;
};

/** Ce qu'un volet de parcours affiche à la fois. Le filtre sert à descendre. */
const BROWSE_ROWS = 60;

type Panel = 'countries' | 'tags' | 'order' | null;

export function Directory({ onAdd, onFieldFocus }: Props) {
  const { p: p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<DirectoryHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // En tête des résultats, ce qui a été demandé : « Norvège · par nom · 40 ».
  const [resultLabel, setResultLabel] = useState('');
  // Chaque URL ajoutée est retenue pour que sa ligne le dise, plutôt que de
  // laisser croire qu'un second appui ferait quelque chose.
  const [added, setAdded] = useState<Record<string, string>>({});
  // Une recherche lente ne doit pas écraser le résultat d'une recherche lancée
  // après elle : seul le dernier numéro de séquence a le droit d'écrire.
  const seq = useRef(0);

  // ─── Parcours et tri ───
  const [panel, setPanel] = useState<Panel>(null);
  const [filter, setFilter] = useState('');
  const [index, setIndex] = useState<Record<string, BrowseEntry[]>>({});
  const [indexBusy, setIndexBusy] = useState(false);
  const [indexErr, setIndexErr] = useState('');
  const [pinned, setPinned] = useState<string[]>([]);
  const [order, setOrder] = useState<RbOrder>(RB_ORDER_DEFAULT);
  // La dernière interrogation, pour la relancer quand le tri change.
  const lastQuery = useRef<DirectoryQuery | null>(null);

  useEffect(() => {
    void (async () => {
      const v = await readString(KEY_RB_ORDER);
      if (isRbOrder(v)) setOrder(v);
      const list = await readJson<unknown>(KEY_RB_PINNED, []);
      if (Array.isArray(list)) setPinned(list.filter((x): x is string => typeof x === 'string'));
    })();
  }, []);

  const clear = useCallback(() => {
    // Repartir de zéro : la liste, le message et la mémoire des ajouts. Sans
    // ça, une recherche restait affichée jusqu à la suivante, sans moyen de la
    // faire disparaître.
    seq.current += 1;
    lastQuery.current = null;
    setQuery('');
    setHits(null);
    setMsg('');
    setResultLabel('');
    setAdded({});
  }, []);

  /** Lance une interrogation, d'où qu'elle vienne : recherche, pays ou genre. */
  const runQuery = useCallback(
    async (q: DirectoryQuery, ord: RbOrder) => {
      lastQuery.current = q;
      const mine = ++seq.current;
      setBusy(true);
      setMsg('⟳ Recherche…');
      setResultLabel('');
      try {
        const list = await runDirectoryQuery(q, ord);
        if (mine !== seq.current) return;
        setHits(list);
        setMsg(list.length ? '' : `Aucun résultat pour « ${q.label} ».`);
        if (list.length) setResultLabel(`${q.label} · ${RB_ORDERS[ord].label} · ${list.length}`);
      } catch {
        if (mine === seq.current) setMsg('⚠ Annuaire injoignable.');
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    },
    [],
  );

  const run = useCallback(() => {
    const q = query.trim();
    // Chercher à vide vide la liste, comme sur le site.
    if (!q) { clear(); return; }
    void runQuery(searchQuery(q), order);
  }, [query, clear, order, runQuery]);

  /** Le tri vaut pour la recherche comme pour le parcours, et se retient. */
  const changeOrder = useCallback(
    (v: RbOrder) => {
      setOrder(v);
      setPanel(null);
      void writeString(KEY_RB_ORDER, v);
      if (lastQuery.current) void runQuery(lastQuery.current, v);
    },
    [runQuery],
  );

  const openPanel = useCallback(
    (kind: Exclude<Panel, null>) => {
      if (panel === kind) { setPanel(null); return; }
      setPanel(kind);
      setFilter('');
      if (kind === 'order' || index[kind]) return;
      setIndexBusy(true);
      setIndexErr('');
      (kind === 'countries' ? loadCountries() : loadTags())
        .then((list) => setIndex((prev) => ({ ...prev, [kind]: list })))
        .catch(() => setIndexErr('⚠ Annuaire injoignable.'))
        .finally(() => setIndexBusy(false));
    },
    [panel, index],
  );

  /** ☆/★ : un pays épinglé remonte en tête et le reste d'un lancement à l'autre. */
  const togglePin = useCallback((code: string) => {
    setPinned((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      void writeJson(KEY_RB_PINNED, next);
      return next;
    });
  }, []);

  const rows = useMemo(() => {
    if (panel !== 'countries' && panel !== 'tags') return [];
    const all = index[panel] ?? [];
    const f = normalizeSearch(filter.trim());
    const kept = f ? all.filter((e) => e.key.includes(f)) : all;
    if (panel !== 'countries') return kept;
    const set = new Set(pinned);
    return [...kept.filter((e) => set.has(e.id)), ...kept.filter((e) => !set.has(e.id))];
  }, [panel, index, filter, pinned]);

  const add = useCallback(
    async (hit: DirectoryHit) => {
      // Le pays regroupe bien mieux qu'un fourre-tout unique : une recherche
      // « jazz » ramène des stations de dix pays différents.
      // La fiche part avec la station : sans elle, la pochette et le compteur
      // d'écoutes seraient perdus dès l'ajout, et il faudrait la retrouver par
      // l'URL à la première écoute.
      const out = await onAdd({
        name: hit.name,
        group: hit.countryCode,
        url: hit.url,
        uuid: hit.uuid,
        favicon: hit.favicon,
      });
      setAdded((prev) => ({ ...prev, [hit.url]: out.ok ? '✓' : '=' }));
    },
    [onAdd],
  );

  return (
    <View style={s.wrap}>
      <Text style={t.sectionLabel}>Annuaire Radio-Browser</Text>
      <View style={s.body}>
        <View style={s.searchRow}>
          <TextInput
            style={[t.input, s.field]}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={run}
            returnKeyType="search"
            placeholder="Chercher une radio (nom, genre, pays…)"
            placeholderTextColor={p.dim}
            autoCapitalize="none"
            onFocus={onFieldFocus}
            accessibilityLabel="Rechercher dans l'annuaire"
          />
          <Pressable
            style={t.btn}
            disabled={busy}
            onPress={run}
            accessibilityRole="button"
            accessibilityLabel="Chercher">
            <Text style={[t.btnText, busy && t.btnOff]}>⌕ CHERCHER</Text>
          </Pressable>
          {hits || msg ? (
            <Pressable
              style={t.btn}
              onPress={clear}
              accessibilityRole="button"
              accessibilityLabel="Effacer les résultats">
              <Text style={t.btnText}>✕</Text>
            </Pressable>
          ) : null}
          {busy ? <ActivityIndicator color={p.base} /> : null}
        </View>

        {/* Chercher suppose de savoir quoi taper : on peut aussi parcourir. Les
            trois boutons restent groupés sur une même ligne, qui passe à la
            ligne d'un bloc — sur téléphone, « TRI » seul en bout de ligne et son
            volet à la ligne suivante n'avaient aucun sens. */}
        <View style={s.browseRow}>
          <Pressable
            style={[t.btn, panel === 'countries' ? s.armed : null]}
            onPress={() => openPanel('countries')}
            accessibilityRole="button"
            accessibilityState={{ expanded: panel === 'countries' }}
            accessibilityLabel="Parcourir par pays">
            <Text style={t.btnText}>◉ PAYS</Text>
          </Pressable>
          <Pressable
            style={[t.btn, panel === 'tags' ? s.armed : null]}
            onPress={() => openPanel('tags')}
            accessibilityRole="button"
            accessibilityState={{ expanded: panel === 'tags' }}
            accessibilityLabel="Parcourir par genre">
            <Text style={t.btnText}># GENRES</Text>
          </Pressable>
          <Pressable
            style={[t.btn, panel === 'order' ? s.armed : null]}
            onPress={() => openPanel('order')}
            accessibilityRole="button"
            accessibilityState={{ expanded: panel === 'order' }}
            accessibilityLabel={`Tri des résultats : ${RB_ORDERS[order].label}`}>
            <Text style={t.btnText}>TRI ▸ {RB_ORDERS[order].label.toLocaleUpperCase()}</Text>
          </Pressable>
        </View>

        {/* Le tri : cinq ordres, un seul actif. Un groupe de boutons radio
            plutôt qu'un menu déroulant — React Native n'en a pas, et un menu
            posé à la main se serait mal comporté dans une page qui défile. */}
        {panel === 'order' ? (
          <View style={s.panel} accessibilityRole="radiogroup">
            {RB_ORDER_IDS.map((id) => (
              <Pressable
                key={id}
                style={s.browseItem}
                onPress={() => changeOrder(id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: id === order }}
                accessibilityLabel={RB_ORDERS[id].label}>
                <Text style={[s.browseName, id === order && s.browseOn]}>
                  {id === order ? '◉' : '○'} {RB_ORDERS[id].label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {panel === 'countries' || panel === 'tags' ? (
          <View style={s.panel}>
            <TextInput
              style={[t.input, s.field]}
              value={filter}
              onChangeText={setFilter}
              placeholder={panel === 'countries' ? 'Filtrer les pays…' : 'Filtrer les genres…'}
              placeholderTextColor={p.dim}
              autoCapitalize="none"
              onFocus={onFieldFocus}
              accessibilityLabel={panel === 'countries' ? 'Filtrer les pays' : 'Filtrer les genres'}
            />
            {indexBusy ? <ActivityIndicator color={p.base} style={s.panelBusy} /> : null}
            {indexErr ? <Text style={t.msgOk}>{indexErr}</Text> : null}
            {rows.slice(0, BROWSE_ROWS).map((e) => (
              <View key={e.id} style={s.browseRowItem}>
                {panel === 'countries' ? (
                  <Pressable
                    onPress={() => togglePin(e.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: pinned.includes(e.id) }}
                    accessibilityLabel={`Épingler ${e.label}`}
                    style={s.pin}>
                    <Text style={[s.browseName, pinned.includes(e.id) && s.browseOn]}>
                      {pinned.includes(e.id) ? '★' : '☆'}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[s.browseItem, s.browseGrow]}
                  onPress={() => {
                    setPanel(null);
                    void runQuery(
                      panel === 'countries' ? countryQuery(e.id, e.label) : tagQuery(e.id),
                      order,
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${e.label}, ${e.count} stations`}>
                  <Text style={s.browseName} numberOfLines={1}>
                    {e.label}
                  </Text>
                  <Text style={s.browseCount}>{e.count}</Text>
                </Pressable>
              </View>
            ))}
            {/* Le reste se trouve en filtrant : dire combien il en reste évite
                de croire la liste tronquée par erreur. */}
            {rows.length > BROWSE_ROWS ? (
              <Text style={s.more}>
                +{rows.length - BROWSE_ROWS} autres — filtrer pour les atteindre.
              </Text>
            ) : null}
            {!indexBusy && !indexErr && !rows.length ? (
              <Text style={t.msgOk}>Aucune entrée pour « {filter.trim()} ».</Text>
            ) : null}
          </View>
        ) : null}

        {msg ? (
          <Text style={t.msgOk} accessibilityLiveRegion="polite">
            {msg}
          </Text>
        ) : null}
        {resultLabel ? (
          <Text style={s.resultLabel} accessibilityLiveRegion="polite">
            {resultLabel}
          </Text>
        ) : null}

        {hits?.map((hit) => (
          <View key={hit.url} style={s.item}>
            <View style={s.info}>
              <Text style={s.name} numberOfLines={1}>
                {hit.name}
              </Text>
              <Text style={s.detail} numberOfLines={1}>
                {hit.detail}
              </Text>
            </View>
            <Pressable
              style={t.btn}
              disabled={!!added[hit.url]}
              onPress={() => add(hit)}
              accessibilityRole="button"
              accessibilityLabel={
                added[hit.url] === '✓'
                  ? `Ajoutée : ${hit.name}`
                  : added[hit.url]
                    ? `Déjà présente : ${hit.name}`
                    : `Ajouter ${hit.name}`
              }>
              <Text style={[t.btnText, added[hit.url] && t.btnOff]}>{added[hit.url] ?? '+'}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: p.border, marginTop: 12 },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  browseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  armed: { borderColor: p.base },
  panel: { borderWidth: 1, borderColor: p.border, padding: 8, marginTop: 8, gap: 4 },
  panelBusy: { marginTop: 6 },
  browseRowItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  browseGrow: { flex: 1, minWidth: 0 },
  // 44 dp de haut : une ligne de liste est une cible tactile, pas du texte.
  pin: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  browseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 6,
  },
  browseName: { color: p.bright, fontFamily: FONT_BODY, fontSize: 13, flexShrink: 1 },
  browseOn: { color: p.base },
  browseCount: { color: p.dim, fontFamily: FONT_BODY, fontSize: 10 },
  more: { color: p.dim, fontFamily: FONT_BODY, fontSize: 10, marginTop: 4 },
  resultLabel: { color: p.dim, fontFamily: FONT_BODY, fontSize: 10, marginTop: 8 },
  field: { flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: p.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
  },
  info: { flex: 1, minWidth: 0 },
  name: { color: p.bright, fontFamily: FONT_BODY, fontSize: 13 },
  detail: { color: p.dim, fontFamily: FONT_BODY, fontSize: 10, marginTop: 2 },
});
