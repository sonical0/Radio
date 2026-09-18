import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, type ViewProps } from 'react-native';

/**
 * L'écran cathodique : la trame de balayage et le vacillement.
 *
 * Sur le site, la trame est un `repeating-linear-gradient` en `body::before`.
 * React Native n'a pas de dégradé répété, et empiler six cents vues d'un pixel
 * serait absurde : on carrelle donc une tuile de 4×4 px (deux lignes
 * transparentes, deux lignes noires à 12 %), qui donne exactement la même
 * période. La tuile pèse 73 octets et vit dans le dépôt, pas sur un réseau.
 */
export function Crt({ children, style, ...rest }: ViewProps) {
  const flicker = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Le profil du site : huit secondes de calme, puis un creux bref à 0,94.
    // Un clignotement régulier fatiguerait ; c'est l'irrégularité qui fait tube.
    const dip = (toValue: number, duration: number) =>
      Animated.timing(flicker, {
        toValue,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      });
    const loop = Animated.loop(
      Animated.sequence([dip(1, 7440), dip(0.94, 80), dip(1, 80), dip(1, 400)]),
    );
    loop.start();
    return () => loop.stop();
  }, [flicker]);

  return (
    <Animated.View style={[styles.root, style, { opacity: flicker }]} {...rest}>
      {children}
      {/* La trame ne doit jamais intercepter un geste : elle recouvre tout. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Image
          source={require('../../assets/scanline.png')}
          resizeMode="repeat"
          style={StyleSheet.absoluteFill}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
