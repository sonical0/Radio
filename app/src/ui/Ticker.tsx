import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent, type TextStyle } from 'react-native';

import { FONT_BODY, GREEN_BRIGHT } from './theme';

const DURATION_MS = 18000;
const HEIGHT = 16;

/**
 * Le titre défilant. Comme sur le site, il ne défile **que** s'il déborde : un
 * titre court qui glisserait sous le nez de l'utilisateur serait une nuisance,
 * pas une animation.
 *
 * Le texte est positionné en absolu à dessein : dans le flux, React Native le
 * contraindrait à la largeur du conteneur et l'abrègerait par des points de
 * suspension, ce qui rendrait la mesure du débordement impossible.
 */
export function Ticker({ text, style }: { text: string; style?: TextStyle }) {
  const [boxWidth, setBoxWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const overflows = boxWidth > 0 && textWidth > boxWidth;

  useEffect(() => {
    if (!overflows) {
      x.setValue(0);
      return;
    }
    x.setValue(boxWidth);
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: -textWidth,
        duration: DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [overflows, boxWidth, textWidth, text, x]);

  return (
    <View style={s.box} onLayout={(e: LayoutChangeEvent) => setBoxWidth(e.nativeEvent.layout.width)}>
      <Animated.Text
        numberOfLines={1}
        onLayout={(e: LayoutChangeEvent) => setTextWidth(e.nativeEvent.layout.width)}
        style={[s.text, style, { transform: [{ translateX: x }] }]}>
        {text}
      </Animated.Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { height: HEIGHT, overflow: 'hidden', justifyContent: 'center' },
  text: {
    position: 'absolute',
    left: 0,
    color: GREEN_BRIGHT,
    fontFamily: FONT_BODY,
    fontSize: 12,
  },
});
