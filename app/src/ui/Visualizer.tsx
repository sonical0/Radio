import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { BORDER, GREEN, GREEN_DIM } from './theme';

const BAR_COUNT = 34;
const UPDATE_MS = 110;
const MIN_H = 3;
const MAX_H = 27;

/**
 * Trente-quatre barres de hauteur aléatoire pendant la lecture. Décoratif, et
 * assumé comme tel : ce ne sont pas de vraies données FFT.
 *
 * Sur le site, c'est une impossibilité technique — `createMediaElementSource()`
 * coupe le son de ces flux cross-origin sans CORS, constaté le 14/09. En natif
 * la contrainte n'existe plus et un vrai spectre serait possible ; tant qu'on
 * vise la parité, on garde le même rendu des deux côtés.
 */
export function Visualizer({ active }: { active: boolean }) {
  const [heights, setHeights] = useState<number[]>(() => Array(BAR_COUNT).fill(MIN_H));
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stop = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
    const start = () => {
      stop();
      timer.current = setInterval(() => {
        setHeights(Array.from({ length: BAR_COUNT }, () => MIN_H + Math.random() * MAX_H));
      }, UPDATE_MS);
    };

    if (!active) {
      stop();
      setHeights(Array(BAR_COUNT).fill(MIN_H));
      return;
    }
    // Rien à animer quand l'appli n'est pas à l'écran : le site suspend sur
    // Page Visibility, on suspend sur AppState, pour la même raison.
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [active]);

  return (
    <View style={s.wrap} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {heights.map((h, i) => (
        <View key={i} style={[s.bar, { height: h }, active && s.barActive]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 30,
    marginHorizontal: 20,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  bar: { flex: 1, minHeight: MIN_H, borderRadius: 1, backgroundColor: BORDER },
  barActive: { backgroundColor: GREEN_DIM },
});

export const VISUALIZER_ACCENT = GREEN;
