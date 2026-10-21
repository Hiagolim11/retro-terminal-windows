# Histórico de versões

## 1.0.0 — 21/10/2026

Primeira versão.

- Terminal para Windows com ConPTY (PowerShell, PowerShell 7, cmd, WSL, Git Bash ou comando personalizado).
- Emulação xterm-256color/truecolor via xterm.js.
- Renderizador CRT em WebGL2: bloom, burn-in, ruído, jitter, linha de varredura, curvatura, luz ambiente,
  cintilação, sincronismo horizontal, deslocamento RGB, moldura com reflexo e rasterização (linhas de varredura,
  pixels, sub-pixels).
- 14 perfis embutidos, perfis do usuário, importação e exportação em JSON.
- 13 fontes (8 incluídas e 5 do Windows), com modo pixelado.
- Abas, várias janelas, instância única, tela cheia, menus nativos.
- Seleção de texto corrigida para a curvatura, suporte a mouse em programas de terminal (X10/SGR).
- Configurações salvas automaticamente em `%APPDATA%\Hacker Terminal Retro\settings.json`.
- Opções de linha de comando compatíveis com o cool-retro-term.
- Correção: o teclado deixava de funcionar depois de clicar na tela.
