import React, { ReactNode, useEffect } from 'react';
import { configClass, varsClass } from 'folds';
import {
  LightTheme,
  ThemeContextProvider,
} from '../hooks/useTheme';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';

export function UnAuthRouteThemeManager() {
  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);
    document.body.classList.add(...LightTheme.classNames);
  }, []);

  return null;
}

export function AuthRouteThemeManager({ children }: { children: ReactNode }) {
  const [monochromeMode] = useSetting(settingsAtom, 'monochromeMode');

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);

    document.body.classList.add(...LightTheme.classNames);

    if (monochromeMode) {
      document.body.style.filter = 'grayscale(1)';
    } else {
      document.body.style.filter = '';
    }
  }, [monochromeMode]);

  return <ThemeContextProvider value={LightTheme}>{children}</ThemeContextProvider>;
}
