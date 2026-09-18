import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { type Palette, useTheme } from './theme';

/**
 * La pastille de la ligne de station : elle pulse pendant la lecture, comme sur
 * le site (`pulse 1.2s infinite`, opacité 1 → 0,3 → 1). Purement décorative,
 * donc masquée aux lecteurs d'écran — l'état est déjà porté par le bouton.
 */
export function StationDot({ playing, selected }: { playing: boolean; selected: boolean }) {
  const { p: p } = useTheme();
  const s = useMemo(() => makeStyles(p), [p]);

  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!playing) {
      pulse.setValue(1);
      return;
    }
    const half = (toValue: number) =>
      Animated.timing(pulse, { toValue, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([half(0.3), half(1)]));
    loop.start();
    return () => loop.stop();
  }, [playing, pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        s.dot,
        selected && s.selected,
        playing && s.playing,
        playing ? { opacity: pulse } : null,
      ]}
    />
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: p.border,
    marginRight: 10,
  },
  selected: { borderColor: p.dim },
  playing: { backgroundColor: p.base, borderColor: p.base },
});
