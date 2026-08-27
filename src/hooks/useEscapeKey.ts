import { useEffect } from 'react';

/**
 * Hook to close modals or overlays on Escape key press.
 * Supports active condition and auto-cleanup.
 */
export function useEscapeKey(onEscape?: () => void, active: boolean = true) {
  useEffect(() => {
    if (!active || !onEscape) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Prevent default browser behavior if needed
        event.stopPropagation();
        onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onEscape, active]);
}
