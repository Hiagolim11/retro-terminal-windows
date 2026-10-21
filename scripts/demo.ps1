# Demonstração para o Hacker Terminal Retro: mostra cores, caracteres especiais e uma listagem.
# Uso dentro do terminal:  powershell -ExecutionPolicy Bypass -File scripts\demo.ps1
# Usa um prompt genérico para não exibir o nome de usuário nas capturas de tela.

function global:prompt { 'PS C:\retro> ' }
Set-Location C:\
Clear-Host

$art = @'
  _  _   _   ___ _  _____ ___
 | || | /_\ / __| |/ / __| _ \
 | __ |/ _ \ (__| ' <| _||   /
 |_||_/_/ \_\___|_|\_\___|_|_\
  _____ ___ ___ __  __ ___ _  _   _   _       ___ ___ _____ ___  ___
 |_   _| __| _ \  \/  |_ _| \| | /_\ | |     | _ \ __|_   _| _ \/ _ \
   | | | _||   / |\/| || || .` |/ _ \| |__   |   / _|  | | |   / (_) |
   |_| |___|_|_\_|  |_|___|_|\_/_/ \_\____|  |_|_\___| |_| |_|_\\___/
'@
Write-Host $art -ForegroundColor Green
Write-Host ''

$steps = @(
  'Aquecendo o tubo de raios catódicos',
  'Carregando fósforo P1 (verde) e P3 (âmbar)',
  'Calibrando curvatura e convergência',
  'Conectando ao ConPTY do Windows'
)
foreach ($s in $steps) {
  Write-Host '  [ ' -NoNewline
  Write-Host 'OK' -ForegroundColor Green -NoNewline
  Write-Host " ] $s"
}
Write-Host ''
Write-Host '  Progresso  ' -NoNewline
Write-Host ('█' * 34) -ForegroundColor Cyan -NoNewline
Write-Host ('░' * 6) -ForegroundColor DarkGray -NoNewline
Write-Host '  85%'
Write-Host ''

Write-Host '  ┌──────────────────────────────────────────────┐'
Write-Host '  │  ' -NoNewline; Write-Host 'Paleta ANSI:' -NoNewline -ForegroundColor Yellow; Write-Host '  ' -NoNewline
foreach ($c in 'Red','Green','Yellow','Blue','Magenta','Cyan','White') { Write-Host '██' -ForegroundColor $c -NoNewline; Write-Host ' ' -NoNewline }
Write-Host (' ' * 9 + '│')
Write-Host '  │  Acentuação: ação, coração, pão, você, é     │'
Write-Host '  └──────────────────────────────────────────────┘'
Write-Host ''
Write-Host "  PowerShell $($PSVersionTable.PSVersion)  ·  $([Environment]::OSVersion.VersionString)" -ForegroundColor DarkGray
Write-Host ''
