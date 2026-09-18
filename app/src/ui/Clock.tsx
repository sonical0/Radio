import { useEffect, useState } from 'react';
import { AppState, Text } from 'react-native';

import { t } from './theme';

function now(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

/** L'horloge de l'en-tête. Arrêtée quand l'appli n'est pas à l'écran. */
export function Clock() {
  const [time, setTime] = useState(now);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      setTime(now());
      id = setInterval(() => setTime(now()), 1000);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, []);

  // L'heure change chaque seconde : une région vivante la ferait annoncer en
  // boucle par un lecteur d'écran.
  return (
    <Text style={t.clock} accessibilityLabel={'Il est ' + time.replace(/:/g, ' heures ')}>
      {time}
    </Text>
  );
}
