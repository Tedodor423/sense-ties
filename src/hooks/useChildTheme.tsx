import { useEffect } from 'react';
import { getThemeColorHsl } from '@/components/ChildColorPicker';

export function useChildTheme(themeColor: string | null | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    
    if (themeColor && themeColor !== 'default') {
      const hsl = getThemeColorHsl(themeColor);
      root.style.setProperty('--child-theme-color', hsl);
      root.classList.add('child-theme-active');
    } else {
      root.style.removeProperty('--child-theme-color');
      root.classList.remove('child-theme-active');
    }

    return () => {
      root.style.removeProperty('--child-theme-color');
      root.classList.remove('child-theme-active');
    };
  }, [themeColor]);
}
