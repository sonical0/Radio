import { useMemo, useState } from 'react';
import { StyleSheet, Pressable, Text, View } from 'react-native';

import type { Station } from '../model/station';
import {
  dayBars,
  dayKey,
  dayTotal,
  fmtListen,
  rangeTotal,
  topStations,
  type ListenStats as Stats,
} from '../store/useListenStats';
import { FONT_BODY, type Palette, useTheme } from './theme';

/** La hauteur de l'histogramme, en points. Une barre vide garde un trait. */
const BAR_MAX_H = 48;

/** « 03/09 » — les 31 barres ne peuvent pas toutes porter leur date. */
function shortDay(day: string): string {
  const [, m, d] = day.split('-');
  return d + '/' + m;
}

/**
 * Le volet du temps d'écoute, sur le patron de l'historique : repliable, et
 * absent tant qu'il n'a rien à montrer. Replié, il n'affiche que le total du
 * jour — c'est le chiffre qu'on vient chercher.
 */
export function ListenStats({
  stats,
  stations,
  onClear,
}: {
  stats: Stats;
  stations: Station[];
  onClear: () => void;
}) {
  const { p, t } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const today = dayKey(new Date());
  const todayTotal = dayTotal(stats, today);
  const bars = useMemo(() => dayBars(stats), [stats]);
  const top = useMemo(() => topStations(stats, stations), [stats, stations]);
  const peak = useMemo(() => Math.max(1, ...bars.map((b) => b.total)), [bars]);

  if (!Object.keys(stats.days).length) return null;

  return (
    <View style={s.wrap}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Temps d'écoute, ${fmtListen(todayTotal)} aujourd'hui`}>
        <Text style={t.sectionLabel}>
          {(open ? '▾ ' : '▸ ') + `Temps d'écoute (${fmtListen(todayTotal)})`}
        </Text>
      </Pressable>

      {open ? (
        <View style={s.body}>
          <View style={s.totals}>
            <Total label="AUJOURD'HUI" value={fmtListen(todayTotal)} s={s} />
            <Total label="7 JOURS" value={fmtListen(rangeTotal(stats, 7))} s={s} />
            <Total label="31 JOURS" value={fmtListen(rangeTotal(stats, 31))} s={s} />
          </View>

          {/* Un histogramme est une image : il porte son propre résumé pour les
              lecteurs d'écran, qui ne liraient rien de trente et une barres. */}
          <View
            style={s.chart}
            accessibilityRole="image"
            accessibilityLabel={`Trente et un jours d'écoute, du ${shortDay(bars[0].day)} à aujourd'hui. Maximum ${fmtListen(peak)}.`}>
            {bars.map((b) => (
              <View
                key={b.day}
                style={[
                  s.bar,
                  {
                    height: Math.max(1, Math.round((b.total / peak) * BAR_MAX_H)),
                    backgroundColor: b.day === today ? p.base : p.dim,
                  },
                ]}
              />
            ))}
          </View>
          <View style={s.chartAxis}>
            <Text style={s.axisText}>{shortDay(bars[0].day)}</Text>
            <Text style={s.axisText}>aujourd'hui</Text>
          </View>

          {top.map((e) => (
            <View key={e.url} style={s.item}>
              <Text style={s.name} numberOfLines={1}>
                {e.name}
              </Text>
              <Text style={s.value}>{fmtListen(e.total)}</Text>
            </View>
          ))}

          {/* Effacement en deux temps, comme l'historique : rien ici n'est
              récupérable une fois parti. */}
          <Pressable
            onPress={() => {
              if (confirming) {
                onClear();
                setConfirming(false);
                setOpen(false);
              } else {
                setConfirming(true);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={confirming ? "Confirmer l'effacement" : "Effacer le temps d'écoute"}
            style={[t.btn, s.clear]}>
            <Text style={t.btnText}>{confirming ? 'CONFIRMER' : 'EFFACER'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Total({
  label,
  value,
  s,
}: {
  label: string;
  value: string;
  s: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={s.total}>
      <Text style={s.totalLabel}>{label}</Text>
      <Text style={s.totalValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    wrap: { marginTop: 8 },
    body: { paddingHorizontal: 16, paddingTop: 8 },
    totals: { flexDirection: 'row', gap: 8 },
    total: { flex: 1, borderWidth: 1, borderColor: p.border, paddingVertical: 6, paddingHorizontal: 8 },
    totalLabel: { color: p.dim, fontFamily: FONT_BODY, fontSize: 9, letterSpacing: 1 },
    totalValue: { color: p.bright, fontFamily: FONT_BODY, fontSize: 13, marginTop: 2 },
    chart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 2,
      height: BAR_MAX_H,
      marginTop: 12,
    },
    bar: { flex: 1, minWidth: 2 },
    chartAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    axisText: { color: p.dim, fontFamily: FONT_BODY, fontSize: 9 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
    },
    name: { flex: 1, minWidth: 0, color: p.bright, fontFamily: FONT_BODY, fontSize: 12 },
    value: { color: p.dim, fontFamily: FONT_BODY, fontSize: 11 },
    clear: { alignSelf: 'flex-start', marginTop: 10 },
  });
