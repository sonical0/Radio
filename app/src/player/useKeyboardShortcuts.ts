// Raccourcis clavier, cible web seulement — un téléphone n'a pas de clavier
// physique, et sur mobile l'écran est la commande.

import { useEffect } from 'react';
import { Platform } from 'react-native';

type Handlers = {
  toggle: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  nudgeVolume: (delta: number) => void;
  toggleMute: () => void;
};

const VOLUME_STEP = 0.05;

export function useKeyboardShortcuts(h: Handlers) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onKey = (e: KeyboardEvent) => {
      // Déjà traité par quelqu'un d'autre : on ne repasse pas derrière.
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;

      const el = e.target as (HTMLElement & { isContentEditable?: boolean }) | null;
      const tag = el?.tagName?.toLowerCase();
      // Taper « s » dans le champ de recherche ne doit pas couper la radio.
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return;
      // Espace sur un bouton qui a le focus : le navigateur l'active déjà, et
      // intercepter ici le ferait compter deux fois.
      if (e.key === ' ' && tag === 'button') return;

      switch (e.key) {
        case ' ':
          h.toggle();
          break;
        case 'ArrowRight':
          h.next();
          break;
        case 'ArrowLeft':
          h.previous();
          break;
        case 'ArrowUp':
          h.nudgeVolume(VOLUME_STEP);
          break;
        case 'ArrowDown':
          h.nudgeVolume(-VOLUME_STEP);
          break;
        case 'm':
        case 'M':
          h.toggleMute();
          break;
        case 's':
        case 'S':
          h.stop();
          break;
        default:
          return;
      }
      e.preventDefault();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [h]);
}
