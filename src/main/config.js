// Valores padrão, fontes, shells e perfis embutidos.
// Os perfis seguem os valores dos perfis do cool-retro-term (ver relatório §13),
// com as fontes trocadas por equivalentes disponíveis neste app.

const PROFILE_VERSION = 2;

// lowRes: fonte "bitmap" renderizada pequena e ampliada (pixelada).
// px: tamanho base em pixels virtuais (para lowRes) ou em pixels de tela (alta resolução).
const FONTS = [
  { id: 'VT323', name: 'VT323 (DEC VT320)', family: 'VT323', lowRes: true, px: 16, source: 'bundled' },
  { id: 'PRESS_START', name: 'Press Start 2P (8-bit)', family: 'Press Start 2P', lowRes: true, px: 8, source: 'bundled' },
  { id: 'SILKSCREEN', name: 'Silkscreen (pixel)', family: 'Silkscreen', lowRes: true, px: 8, source: 'bundled' },
  { id: 'SHARE_TECH', name: 'Share Tech Mono', family: 'Share Tech Mono', lowRes: false, px: 16, source: 'bundled' },
  { id: 'IBM_PLEX', name: 'IBM Plex Mono', family: 'IBM Plex Mono', lowRes: false, px: 15, source: 'bundled' },
  { id: 'JETBRAINS_MONO', name: 'JetBrains Mono', family: 'JetBrains Mono', lowRes: false, px: 15, source: 'bundled' },
  { id: 'FIRA_CODE', name: 'Fira Code', family: 'Fira Code', lowRes: false, px: 15, source: 'bundled' },
  { id: 'SPACE_MONO', name: 'Space Mono', family: 'Space Mono', lowRes: false, px: 15, source: 'bundled' },
  { id: 'CONSOLAS', name: 'Consolas', family: 'Consolas', lowRes: false, px: 16, source: 'system' },
  { id: 'CASCADIA', name: 'Cascadia Mono', family: 'Cascadia Mono', lowRes: false, px: 15, source: 'system' },
  { id: 'LUCIDA', name: 'Lucida Console', family: 'Lucida Console', lowRes: false, px: 15, source: 'system' },
  { id: 'COURIER', name: 'Courier New', family: 'Courier New', lowRes: false, px: 16, source: 'system' },
  { id: 'CONSOLAS_PIXEL', name: 'Consolas (pixelada)', family: 'Consolas', lowRes: true, px: 12, source: 'system' },
];

const SHELLS = [
  { id: 'powershell', name: 'Windows PowerShell', file: 'powershell.exe', args: ['-NoLogo'] },
  { id: 'pwsh', name: 'PowerShell 7 (pwsh)', file: 'pwsh.exe', args: ['-NoLogo'] },
  { id: 'cmd', name: 'Prompt de Comando (cmd)', file: 'cmd.exe', args: [] },
  { id: 'wsl', name: 'WSL (Linux)', file: 'wsl.exe', args: [] },
  { id: 'gitbash', name: 'Git Bash', file: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['--login', '-i'] },
];

// Configurações gerais (não fazem parte do perfil).
const DEFAULT_GENERAL = {
  shell: 'powershell',
  useCustomCommand: false,
  customCommand: '',
  showMenubar: false,
  showTerminalSize: true,
  fontScaling: 1.0,
  effectsFrameSkip: 1,
  windowScaling: 1.0,   // "Texture Quality"
  bloomQuality: 0.5,
  burnInQuality: 0.5,
  scrollback: 5000,
};

// Perfil padrão (valores de --default-settings no original).
const DEFAULT_PROFILE = {
  backgroundColor: '#000000',
  fontColor: '#ff8100',
  frameColor: '#ffffff',
  flickering: 0.1,
  horizontalSync: 0.08,
  staticNoise: 0.12,
  chromaColor: 0.25,
  saturationColor: 0.25,
  screenCurvature: 0.3,
  glowingLine: 0.2,
  burnIn: 0.25,
  bloom: 0.55,
  rasterization: 0,
  jitter: 0.2,
  rgbShift: 0.0,
  brightness: 0.5,
  contrast: 0.8,
  ambientLight: 0.2,
  windowOpacity: 1.0,
  fontName: 'VT323',
  fontWidth: 1.0,
  lineSpacing: 0.1,
  margin: 0.5,
  blinkingCursor: false,
  frameSize: 0.2,
  screenRadius: 0.2,
  frameShininess: 0.2,
};

function p(values) {
  return Object.assign({}, DEFAULT_PROFILE, values);
}

const BUILTIN_PROFILES = [
  { name: 'Default Amber', profile: p({ ambientLight: 0.3, bloom: 0.6, burnIn: 0.3, chromaColor: 0.2, flickering: 0.1, fontColor: '#ff8100', fontName: 'VT323', glowingLine: 0.2, horizontalSync: 0.1, jitter: 0.2, rasterization: 0, saturationColor: 0.2, screenCurvature: 0.2, screenRadius: 0.1, staticNoise: 0.1, margin: 0.3, frameSize: 0.1, frameColor: '#cfcfcf', frameShininess: 0.3 }) },
  { name: 'Monochrome Green', profile: p({ ambientLight: 0.3, bloom: 0.5, burnIn: 0.3, chromaColor: 0, fontColor: '#0ccc68', fontName: 'VT323', glowingLine: 0.2, horizontalSync: 0.1, jitter: 0.2, rasterization: 0, saturationColor: 0, screenCurvature: 0.3, screenRadius: 0.2, staticNoise: 0.1, margin: 0.3, frameSize: 0.1, frameColor: '#d4d4d4', frameShininess: 0.1 }) },
  { name: 'Deep Blue', profile: p({ ambientLight: 0, bloom: 0.6, burnIn: 0.3, chromaColor: 1, fontColor: '#7fb4ff', fontName: 'VT323', glowingLine: 0.2, horizontalSync: 0.1, jitter: 0.2, rasterization: 0, saturationColor: 0.2, screenCurvature: 0.4, screenRadius: 0.1, staticNoise: 0.1, margin: 0.3, frameSize: 0.1, frameColor: '#ffffff', frameShininess: 0.9 }) },
  { name: 'Commodore 64', profile: p({ ambientLight: 0.4, backgroundColor: '#3b3b8f', bloom: 0.4, brightness: 0.6, burnIn: 0.1, chromaColor: 0, contrast: 0.7, fontColor: '#a9a7ff', fontName: 'PRESS_START', glowingLine: 0.1, horizontalSync: 0, jitter: 0, rasterization: 1, saturationColor: 0, screenCurvature: 0.5, screenRadius: 0.1, staticNoise: 0.1, margin: 0.3, frameSize: 0.5, frameColor: '#999999', frameShininess: 0 }) },
  { name: 'Commodore PET', profile: p({ ambientLight: 0, bloom: 0.4, burnIn: 0.4, chromaColor: 0, flickering: 0.2, fontColor: '#ffffff', fontName: 'PRESS_START', fontWidth: 1.25, glowingLine: 0.3, horizontalSync: 0.2, jitter: 0.15, rasterization: 1, saturationColor: 0, screenCurvature: 0.7, screenRadius: 0.3, staticNoise: 0.2, margin: 0.2, frameSize: 0.5, frameColor: '#000000', frameShininess: 0.6 }) },
  { name: 'Apple ][', profile: p({ ambientLight: 1, backgroundColor: '#001100', bloom: 0.3, burnIn: 0.3, chromaColor: 0, flickering: 0.2, fontColor: '#4dff6b', fontName: 'SILKSCREEN', fontWidth: 1.25, glowingLine: 0.3, horizontalSync: 0.2, jitter: 0.2, rasterization: 1, saturationColor: 0, screenCurvature: 0.5, screenRadius: 0.3, staticNoise: 0.2, margin: 0, frameSize: 0.2, frameColor: '#ffffff', frameShininess: 0.8 }) },
  { name: 'Atari 400', profile: p({ ambientLight: 0.1, backgroundColor: '#0f1f5a', bloom: 0.1, brightness: 0.6, burnIn: 0.2, chromaColor: 0, contrast: 0.9, fontColor: '#8ed6ff', fontName: 'PRESS_START', glowingLine: 0.1, horizontalSync: 0, jitter: 0, rasterization: 1, saturationColor: 0, screenCurvature: 0.4, screenRadius: 0.2, staticNoise: 0.1, margin: 0.2, frameSize: 0.4, frameColor: '#cccccc', frameShininess: 0.3 }) },
  { name: 'IBM VGA 8x16', profile: p({ ambientLight: 0.2, bloom: 0.2, brightness: 0.6, burnIn: 0.1, chromaColor: 0.5, contrast: 1, fontColor: '#c0c0c0', fontName: 'CONSOLAS_PIXEL', glowingLine: 0.1, horizontalSync: 0, jitter: 0, rasterization: 1, rgbShift: 0.1, saturationColor: 0, screenCurvature: 0.3, screenRadius: 0.1, staticNoise: 0, margin: 0.2, frameSize: 0.1, frameColor: '#ffffff', frameShininess: 0.3 }) },
  { name: 'IBM 3278 Reborn', profile: p({ ambientLight: 0.2, bloom: 0.2, burnIn: 0.5, chromaColor: 0, flickering: 0, fontColor: '#3cff7a', fontName: 'SHARE_TECH', glowingLine: 0, horizontalSync: 0, jitter: 0, rasterization: 4, saturationColor: 0, screenCurvature: 0, screenRadius: 0, staticNoise: 0, margin: 0.1, frameSize: 0, frameColor: '#ffffff', frameShininess: 0.2 }) },
  { name: 'Neon Cyan', profile: p({ ambientLight: 0.1, backgroundColor: '#001018', bloom: 0.6, brightness: 0.6, burnIn: 0.1, chromaColor: 1, contrast: 0.9, fontColor: '#52f7ff', fontName: 'IBM_PLEX', glowingLine: 0.2, horizontalSync: 0, jitter: 0.1, rasterization: 4, saturationColor: 0.6, screenCurvature: 0, screenRadius: 0, staticNoise: 0.1, windowOpacity: 0.8, margin: 0.1, frameSize: 0, frameColor: '#c3c3c3', frameShininess: 0.2 }) },
  { name: 'Ghost Terminal', profile: p({ ambientLight: 0.3, backgroundColor: '#0b1014', bloom: 0.3, brightness: 0.6, burnIn: 0.2, chromaColor: 0, contrast: 0.5, flickering: 0, fontColor: '#a6b3c0', fontName: 'JETBRAINS_MONO', glowingLine: 0.1, horizontalSync: 0, jitter: 0, rasterization: 4, saturationColor: 0, screenCurvature: 0, screenRadius: 0, staticNoise: 0.1, windowOpacity: 0.7, margin: 0.1, frameSize: 0, frameColor: '#a7a7a7', frameShininess: 0.2 }) },
  { name: 'Plasma', profile: p({ ambientLight: 0.1, backgroundColor: '#070014', bloom: 0.7, brightness: 0.6, burnIn: 0.1, chromaColor: 1, fontColor: '#ff9bd6', fontName: 'FIRA_CODE', glowingLine: 0.2, horizontalSync: 0, jitter: 0.1, rasterization: 4, rgbShift: 0.1, saturationColor: 0.8, screenCurvature: 0, screenRadius: 0, staticNoise: 0.1, margin: 0.1, frameSize: 0, frameColor: '#d0d0d0', frameShininess: 0.2 }) },
  { name: 'Boring', profile: p({ ambientLight: 0.1, bloom: 0.5, burnIn: 0.05, chromaColor: 1, flickering: 0, fontColor: '#ffffff', fontName: 'JETBRAINS_MONO', glowingLine: 0.1, horizontalSync: 0, jitter: 0, rasterization: 4, saturationColor: 0, screenCurvature: 0, screenRadius: 0, staticNoise: 0, margin: 0, frameSize: 0, frameColor: '#c0c0c0', frameShininess: 0.2 }) },
  { name: 'E-Ink', profile: p({ ambientLight: 0.6, backgroundColor: '#f2f2ec', bloom: 0, brightness: 1, burnIn: 0.6, chromaColor: 0, contrast: 0.5, flickering: 0, fontColor: '#101010', fontName: 'IBM_PLEX', glowingLine: 0, horizontalSync: 0, jitter: 0, rasterization: 4, saturationColor: 0, screenCurvature: 0, screenRadius: 0, staticNoise: 0, margin: 0.1, frameSize: 0, frameColor: '#cdcdcd', frameShininess: 0.2 }) },
];

module.exports = { PROFILE_VERSION, FONTS, SHELLS, DEFAULT_GENERAL, DEFAULT_PROFILE, BUILTIN_PROFILES };
