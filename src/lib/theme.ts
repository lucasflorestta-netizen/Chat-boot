const THEME_KEY = 'cc-ui-theme';

export type UiTheme = 'dark' | 'light';

export function readStoredTheme(): UiTheme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function writeStoredTheme(theme: UiTheme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function applyTheme(theme: UiTheme) {
  const root = document.documentElement;
  root.classList.toggle('theme-light', theme === 'light');
  root.classList.toggle('theme-dark', theme === 'dark');
  root.style.colorScheme = theme;
  writeStoredTheme(theme);
}

export function initTheme() {
  applyTheme(readStoredTheme());
}

export function toggleTheme(): UiTheme {
  const next: UiTheme = readStoredTheme() === 'light' ? 'dark' : 'light';
  applyTheme(next);
  return next;
}
