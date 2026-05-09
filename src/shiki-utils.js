export const SHIKI_THEME_BY_PALETTE = {
  dark: 'github-dark-dimmed',
  midnight: 'github-dark-dimmed',
  slate: 'github-dark-dimmed',
  teal: 'github-light',
  light: 'github-light',
  paper: 'github-light',
  warm: 'github-light',
  clay: 'github-light',
};

export function resolveShikiThemeName(paletteName, codeTheme = null) {
  return codeTheme || SHIKI_THEME_BY_PALETTE[paletteName] || 'github-dark-dimmed';
}

const SHIKI_LANG_ALIASES = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  jsonc: 'jsonc',
  cxx: 'cpp',
  'c++': 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
};

export function normalizeShikiLang(lang) {
  const value = String(lang ?? '').trim().toLowerCase();
  if (!value) return 'text';
  return SHIKI_LANG_ALIASES[value] || value;
}
