# GravIn

Extensão para Chrome/Edge que grava a aba já recortada no tamanho do dispositivo selecionado no modo dispositivo do DevTools — sem OBS, sem recorte manual.

## Instalação

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione esta pasta.

## Uso

1. Nas opções da extensão, escolha a pasta de destino (padrão: `Downloads/GravIn`).
2. Abra o DevTools (`F12`), ative o modo dispositivo (`Ctrl+Shift+M`) e selecione o dispositivo.
3. Clique no ícone do GravIn → **Iniciar gravação** (ou `Alt+Shift+R`).
4. Clique de novo para parar. O vídeo é salvo como `gravin_<data>_<largura>x<altura>.mp4`.

## Opções

- **Pasta de destino:** qualquer pasta do computador. Ao autorizar, escolha "Permitir em todas as visitas"; sem permissão, o vídeo cai em `Downloads/GravIn`.
- **Formato:** MP4 (H.264, padrão) ou WebM (VP9).
- **Resolução:** automática (até 2× o tamanho CSS, padrão), 1× ou nativa do dispositivo.

## Limitações

- Não grava áudio.
- Trocar de dispositivo ou girar a tela durante a gravação não muda o tamanho do vídeo; pare e inicie de novo.
- Não funciona em páginas internas do navegador (`chrome://`).
