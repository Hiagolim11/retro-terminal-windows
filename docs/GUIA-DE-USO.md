# Guia de uso

← [Voltar ao README](../README.md)

## Sumário

1. [Primeiros passos](#1-primeiros-passos)
2. [Abas e janelas](#2-abas-e-janelas)
3. [Copiar, colar e selecionar](#3-copiar-colar-e-selecionar)
4. [Perfis](#4-perfis)
5. [Configurações, opção por opção](#5-configurações-opção-por-opção)
6. [Escolhendo o shell](#6-escolhendo-o-shell)
7. [Desempenho](#7-desempenho)
8. [Onde ficam os arquivos](#8-onde-ficam-os-arquivos)
9. [Solução de problemas](#9-solução-de-problemas)

---

## 1. Primeiros passos

1. Baixe o instalador ou a versão portátil na página [Releases](../../../releases/latest) e execute.
2. Se o Windows SmartScreen avisar, clique em **Mais informações → Executar assim mesmo**. O aviso aparece porque
   o executável não tem assinatura digital paga.
3. O terminal abre com o **Windows PowerShell** e o perfil **Default Amber**.

<p align="center"><img src="images/perfis/default-amber.jpg" width="640" alt="Primeira execução"></p>

Para trocar de perfil, use o **botão direito → Perfis**. Para ver a lista de atalhos, pressione **F1**.

## 2. Abas e janelas

- **Nova aba:** `Ctrl+Shift+T`, ou o botão **+** da barra de abas.
- A barra de abas só aparece quando há duas ou mais abas, para não atrapalhar o visual retrô.
- **Trocar de aba:** clique, `Alt+1`…`Alt+9`, `Ctrl+Tab` / `Ctrl+Shift+Tab`.
- **Fechar aba:** `Ctrl+Shift+W`, o **×** da aba ou clique com o botão do meio. Digitar `exit` no shell também fecha a aba.
- Fechar a última aba fecha a janela, e fechar a última janela encerra o app.
- **Nova janela:** `Ctrl+Shift+N`. Abrir o `.exe` de novo também cria uma janela nova na instância que já está rodando.
- O título de cada aba é o que o shell informar, por exemplo a pasta atual ou o programa em execução.
- Ao redimensionar, o tamanho em **colunas×linhas** aparece por 1 segundo no centro da tela. Isso pode ser desligado em Avançado.

<p align="center"><img src="images/perfis/commodore-64.jpg" width="640" alt="Perfil Commodore 64"></p>

## 3. Copiar, colar e selecionar

| Ação | Como |
|---|---|
| Selecionar | arraste com o botão esquerdo (a tela rola sozinha se você arrastar para fora) |
| Selecionar palavra / linha | duplo clique / triplo clique |
| Copiar | `Ctrl+Shift+C`, ou `Ctrl+C` **com texto selecionado** (sem seleção, `Ctrl+C` interrompe o programa, como sempre) |
| Colar | `Ctrl+Shift+V`, `Shift+Insert` ou **botão do meio** |
| Selecionar tudo | `Ctrl+Shift+A` |

Em programas que usam o mouse (`vim` com `set mouse=a`, `htop`, `mc`), os cliques vão para o programa. Segure **Shift**
para selecionar texto ou abrir o menu mesmo assim.

## 4. Perfis

Um **perfil** guarda toda a aparência: cores, fonte, efeitos e moldura. Os 14 perfis embutidos estão na
[galeria do README](../README.md#galeria-de-perfis).

Em **Configurações → Geral → Perfis**:

| Botão | Função |
|---|---|
| **Carregar** (ou duplo clique) | aplica o perfil selecionado |
| **Salvar atual…** | salva a aparência atual com um nome novo (nomes vazios ou repetidos são recusados) |
| **Remover** | apaga um perfil seu (os embutidos são protegidos) |
| **Importar… / Exportar…** | lê ou grava o perfil num arquivo `.json` |

Os seus perfis aparecem com ★ na lista e também no menu **Perfis**.

### Formato do arquivo de perfil

O formato é compatível com o do cool-retro-term (versão 2). Todos os números vão de 0 a 1, exceto onde indicado:

```json
{
  "name": "Meu Âmbar",
  "version": 2,
  "fontColor": "#ff8100",
  "backgroundColor": "#000000",
  "frameColor": "#cfcfcf",
  "fontName": "VT323",
  "rasterization": 1,
  "fontWidth": 1.0,
  "lineSpacing": 0.1,
  "bloom": 0.6, "burnIn": 0.3, "staticNoise": 0.1, "jitter": 0.2,
  "glowingLine": 0.2, "screenCurvature": 0.3, "ambientLight": 0.3,
  "flickering": 0.1, "horizontalSync": 0.1, "rgbShift": 0,
  "chromaColor": 0.2, "saturationColor": 0.2,
  "brightness": 0.5, "contrast": 0.8, "windowOpacity": 1,
  "margin": 0.3, "screenRadius": 0.1, "frameSize": 0.1, "frameShininess": 0.3,
  "blinkingCursor": false
}
```

- `rasterization`: 0 = padrão, 1 = linhas de varredura, 2 = pixels, 3 = sub-pixels, 4 = moderna.
- `fontWidth`: de 0,5 a 1,5.
- `fontName`: `VT323`, `PRESS_START`, `SILKSCREEN`, `SHARE_TECH`, `IBM_PLEX`, `JETBRAINS_MONO`, `FIRA_CODE`,
  `SPACE_MONO`, `CONSOLAS`, `CASCADIA`, `LUCIDA`, `COURIER`, `CONSOLAS_PIXEL`. Um nome desconhecido mantém a fonte atual.
- Campos ausentes mantêm o valor atual, então dá para importar um perfil "parcial".

## 5. Configurações, opção por opção

Abra pelo **botão direito → Configurações…** ou com `Ctrl+,`. Toda alteração aparece na hora em todas as janelas e é
salva automaticamente.

<p align="center"><img src="images/app/configuracoes-geral.png" width="520" alt="Configurações - aba Geral"></p>

### Geral → Tela

| Opção | O que faz |
|---|---|
| Brilho | multiplica o brilho final (de 0,5× a 1,5×) |
| Contraste | quanto a cor da fonte se destaca do fundo |
| Margem | espaço entre a borda da tela e o texto |
| Raio dos cantos | arredondamento dos cantos da tela (de 4 a 120 px) |
| Tamanho da moldura | espessura do gabinete ao redor da tela |
| Opacidade da janela | deixa a janela translúcida |

### Terminal → Fonte

| Opção | O que faz |
|---|---|
| Origem | **Incluídas** (fontes que vêm com o app) ou **Do Windows** |
| Nome | a fonte. As marcadas como *pixelada* são desenhadas em baixa resolução e ampliadas, como num monitor antigo |
| Renderização | **Padrão**: pixels lisos · **Linhas de varredura**: faixas escuras entre as linhas · **Pixels**: grade visível · **Sub-pixels**: tríades RGB · **Moderna**: alta resolução, sem pixelização |
| Escala | tamanho do texto, de 25% a 250% (o mesmo que o zoom `Ctrl+=`/`Ctrl+-`) |
| Largura da fonte | estica ou comprime os caracteres na horizontal |
| Espaçamento de linha | espaço extra entre as linhas |

Ao escolher uma fonte de alta resolução, a renderização muda para **Moderna** automaticamente. Ao escolher uma fonte
pixelada, ela sai do modo Moderna.

### Terminal → Cores

| Opção | O que faz |
|---|---|
| Cor (chroma) | **0** = monocromático, tudo tingido com a cor da fonte · **100%** = mantém as cores ANSI dos programas |
| Saturação | mistura a cor da fonte com branco (só funciona com chroma maior que 0) |
| Fonte / Fundo / Moldura | cores base; a mudança aparece ao vivo enquanto você escolhe |

<p align="center">
  <img src="images/perfis/monochrome-green.jpg" width="45%" alt="Chroma 0 (monocromático)">
  <img src="images/perfis/deep-blue.jpg" width="45%" alt="Chroma 100% (colorido)">
  <br><sub>Chroma 0 (Monochrome Green) × chroma 100% (Deep Blue)</sub>
</p>

### Efeitos

Cada efeito tem uma caixa (liga/desliga) e um controle de intensidade. Desligar e ligar de novo recupera a intensidade
anterior.

| Efeito | Dica |
|---|---|
| Bloom (brilho) | o efeito mais marcante; 40–60% fica natural |
| Burn-in (rastro) | quanto maior, mais tempo o rastro demora a sumir ao rolar a tela |
| Ruído estático | 10–15% dá textura sem cansar a vista |
| Tremor (jitter) | sutil; acima de 50% fica difícil de ler |
| Linha de varredura | faixa de luz que desce pela tela |
| Curvatura da tela | 0 = tela plana |
| Luz ambiente | reflexo no vidro; só funciona com moldura ou curvatura |
| Cintilação | variação de brilho a cada quadro |
| Sincronismo horizontal | "rasgos" horizontais ocasionais |
| Deslocamento RGB | aberração cromática |
| Brilho da moldura | a moldura reflete o conteúdo da tela |

<p align="center">
  <img src="images/perfis/boring.jpg" width="45%" alt="Quase sem efeitos">
  <img src="images/perfis/commodore-pet.jpg" width="45%" alt="Muitos efeitos">
  <br><sub>Quase sem efeitos (Boring) × curvatura, ruído e moldura fortes (Commodore PET)</sub>
</p>

### Avançado

| Opção | O que faz |
|---|---|
| Shell padrão | qual programa abre em cada aba nova (veja a seção 6) |
| Comando personalizado | roda outro programa no lugar do shell, por exemplo `ssh usuario@servidor` |
| Cursor piscante | cursor piscando a cada ~0,5 s |
| Mostrar barra de menu | barra Arquivo / Editar / Exibir / Perfis / Ajuda no topo da janela |
| Mostrar tamanho ao redimensionar | sobreposição com colunas×linhas |
| Linhas de histórico | quantas linhas ficam guardadas para rolar (100 a 100 000) |
| FPS dos efeitos | 100% anima os efeitos a cada quadro; valores menores economizam GPU |
| Qualidade da textura | resolução interna dos efeitos |
| Qualidade do bloom / burn-in | resolução dos efeitos de brilho e rastro |

## 6. Escolhendo o shell

| Opção | Programa |
|---|---|
| Windows PowerShell | `powershell.exe` (padrão) |
| PowerShell 7 | `pwsh.exe`, se estiver instalado |
| Prompt de Comando | `cmd.exe` |
| WSL | `wsl.exe` (precisa do WSL funcionando) |
| Git Bash | `C:\Program Files\Git\bin\bash.exe`, se estiver instalado |

Opções que não forem encontradas no seu computador aparecem desabilitadas. No **comando personalizado**, use aspas
para caminhos com espaço:

```
"C:\Program Files\Git\bin\bash.exe" --login -i
```

## 7. Desempenho

O visual é feito na placa de vídeo. Em notebooks fracos ou para economizar bateria:

1. Diminua **FPS dos efeitos** para 50% ou 33%.
2. Diminua **Qualidade da textura** para 75%.
3. Desligue **Ruído**, **Jitter**, **Cintilação** e **Sincronismo**: com eles desligados, a tela só é redesenhada quando o texto muda.
4. Ou use o perfil **Boring**.

## 8. Onde ficam os arquivos

| O quê | Onde |
|---|---|
| Configurações e perfis | `%APPDATA%\Hacker Terminal Retro\settings.json` |
| App instalado | `%LOCALAPPDATA%\Programs\hacker-terminal-retro\` |

Para voltar ao padrão de fábrica, feche o app e apague o `settings.json`, ou inicie com `--default-settings`.

## 9. Solução de problemas

| Problema | Solução |
|---|---|
| "O Windows protegeu o computador" | **Mais informações → Executar assim mesmo** (o executável não tem assinatura digital paga). |
| O teclado não responde | Clique dentro da tela do terminal. Se continuar, atualize para a versão mais recente. |
| A fonte aparece só em MAIÚSCULAS | A fonte **Silkscreen** só tem maiúsculas. Troque em Configurações → Terminal → Nome. |
| Tela preta / sem efeitos | A placa de vídeo pode não suportar WebGL2. O app mostra um aviso e funciona sem efeitos. Atualize o driver de vídeo. |
| "Não foi possível iniciar…" ao abrir uma aba | O shell escolhido não existe. Mude em Configurações → Avançado → Shell padrão. |
| O WSL não abre | O WSL precisa estar instalado e a virtualização ativada na BIOS (`wsl --install`). |
| Letras borradas | Use a renderização **Moderna** com uma fonte de alta resolução, ou aumente a **Qualidade da textura**. |
| Uso alto de GPU | Veja a seção [Desempenho](#7-desempenho). |
