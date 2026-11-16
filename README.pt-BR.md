<p align="center">
  <img src="apps/web/public/icons/icon-192x192.png" alt="Logo da Tiê AI" width="96" />
</p>

<h1 align="center">Tiê AI</h1>

<p align="center">
  Editor de vídeo open source, com IA no centro e tudo rodando na sua máquina. Um fork do OpenCut.
</p>

<p align="center">
  <a href="README.md">Read in English</a>
</p>

---

A Tiê AI é um editor de vídeo com um conjunto de ferramentas de IA embutido,
num app de desktop para Windows. O editor e os modelos de IA rodam no seu
computador, e os projetos também ficam nele. Cada recurso de IA é um pacote
que você instala pelo app, e os modelos só são baixados quando você os
escolhe. Só vai para a internet o que você ligar, como um LLM na nuvem pela
[OpenRouter](https://openrouter.ai/) ou a busca de GIFs da
[KLIPY](https://klipy.com/) (veja [Privacidade](#privacidade)).

A interface é em português do Brasil e o foco é vídeo curto: YouTube Shorts,
Reels, TikTok e vídeos de venda do TikTok Shop.

A Tiê AI é um fork do [OpenCut AI](https://github.com/Ekaanth/OpenCut-AI), que
por sua vez é um fork do [OpenCut](https://github.com/OpenCut-app/OpenCut).

## Funcionalidades

Edição (do OpenCut, ampliada):

- Linha do tempo com várias trilhas de vídeo, áudio, texto e figurinhas,
  prévia em tempo real, transições, efeitos, filtros de cor e ajustes de
  brilho, contraste e saturação.
- Estilos de texto, incluindo recorte de jornal e gradiente.
- Menu do clipe (botão direito): dividir, copiar, silenciar, separar áudio,
  remover silêncios, ocultar, duplicar, excluir.
- Exportação com formato, resolução e qualidade, exportação só do áudio (M4A,
  MP3, WAV) e volume no padrão das redes (-14 LUFS).
- Kit de marca: cores, fontes, logotipos e sobreposições.

Recursos de IA:

- **Transcrição e legendas**: fala para texto com
  [faster-whisper](https://github.com/SYSTRAN/faster-whisper) e legendas
  automáticas.
- **Clonagem de voz e narração**: grave ou envie de 10 a 15 segundos de fala
  e clone a voz com o Chatterbox Multilingual, rodando na sua GPU. Digite um
  texto e gere a fala com a voz clonada ou uma voz pronta; ponha na linha do
  tempo ou baixe em MP3 ou WAV.
- **Estúdio de IA**: um chat que conhece o projeto aberto, mais ferramentas de
  roteiro, ideias, B-roll, dublagem, remoção de fundo, capítulos e
  reenquadramento. O chat responde "onde fica X?" e abre o lugar na
  interface.
- **Criar vídeo com IA**: monta um vídeo inteiro a partir de um tema, com
  imagens de banco do Pexels e do Wikimedia Commons.
- **Clipes de podcast**: encontra os melhores trechos de um vídeo longo para
  virar cortes.
- **Pontuação Viral e verificação do TikTok Shop**: dá nota ao vídeo e confere
  quadros e transcrição contra as regras do TikTok Shop, usando o modelo de
  visão ativo.
- **Pesquisa no vídeo**: encontra momentos pelo que aparece na imagem, com
  embeddings CLIP calculados localmente.
- **Geração de vídeo com IA**: clipes a partir de texto ou imagem, pela
  Replicate ou pela PiAPI, com a sua chave.
- **GIFs e figurinhas**: setas animadas, botões "clique aqui" e reações da
  KLIPY, além do Kit TikTok Shop, figurinhas e emojis.
- **Separação de locutores** (quem fala em cada trecho, e a emoção da fala),
  **rastreamento de rosto** para reenquadrar em 9:16, **tradução local** e
  **geração de imagens local**, cada um no seu serviço.
- **Modelos locais escolhidos onde são usados**: o modelo de transcrição em
  Legendas e o de imagem no Tiê Image, cada um mostrando o tamanho, a memória
  de vídeo que precisa, se já está baixado e qual combina com o seu PC. A
  "Configuração de IA" lista os modelos baixados para você liberar espaço.

Em desenvolvimento:

- **Busca híbrida de cenas** nas transcrições (lexical + semântica). Ainda não
  faz parte desta branch.

## Arquitetura

```
App de desktop Tiê AI (Electron, apps/desktop)
  └─ Editor Next.js (apps/web), servidor standalone em 127.0.0.1:3100
       ├─ projetos e mídia: armazenamento do app (IndexedDB / OPFS)
       ├─ banco de dados: PGlite (Postgres embutido)
       ├─ busca de GIFs da KLIPY ───────────────────────► api.klipy.com
       └─ chamadas de IA ──► ai-backend (FastAPI, :8420), o gateway
                               ├─ whisper-service    :8421  faster-whisper
                               ├─ tts-service        :8422  Coqui XTTS
                               ├─ image-service      :8423  diffusers, rembg
                               ├─ speaker-service    :8424  SpeechBrain (pyannote com chave do HF)
                               ├─ face-service       :8425  MediaPipe
                               ├─ clip-service       :8426  embeddings CLIP
                               ├─ translate-service  :8427  NLLB-200
                               ├─ chatterbox-service :8428  clonagem de voz
                               ├─ turboquant-service :8430  LLMs locais (Hugging Face)
                               └─ OpenRouter (opcional) ──► openrouter.ai
```

Os serviços de IA vêm em **pacotes**, instalados pela "Configuração de IA" no
app. Cada pacote é um ambiente Python próprio, feito com o
[uv](https://docs.astral.sh/uv/), porque os serviços precisam de versões
diferentes do PyTorch:

| Pacote | Serviços | Usa a GPU |
|---|---|---|
| Base de IA | ai-backend, whisper-service | Sim (transcrição) |
| Voz clonada | chatterbox-service | Sim |
| Imagem | image-service | Sim |
| Vozes prontas | tts-service | Sim |
| Falantes | speaker-service | Sim |
| Rosto | face-service | Não |
| Tradução e busca | translate-service, clip-service | Sim |
| Chat local | turboquant-service | Sim |

Os pacotes instalados ligam junto com o app e desligam com ele. Tudo escuta só
em `127.0.0.1`. O app guarda os dados em `%APPDATA%\Tiê AI`: o banco, os
pacotes (`packs`), os modelos baixados (`ai\models`), as vozes clonadas e os
logs.

O LLM é escolhido no chat, abaixo do campo de mensagem: um modelo grátis na
nuvem pela OpenRouter, ou um modelo local do pacote "Chat local". Com a
OpenRouter, os modelos pagos ficam bloqueados a menos que
`OPENROUTER_ALLOW_PAID=true`. Se um modelo da nuvem falhar, o backend tenta os
próximos modelos grátis e depois o modelo local. O Ollama não vem com o app;
o backend ainda o usa se você o rodar por conta própria na porta 11434.

## Como rodar

### Requisitos

- Windows 11.
- [Bun](https://bun.sh/), [uv](https://docs.astral.sh/uv/) e
  [FFmpeg](https://ffmpeg.org/) no `PATH`.
- Uma GPU NVIDIA é recomendada. Os pacotes usam o PyTorch feito para CUDA 12.8,
  que também atende as placas RTX 50. Sem GPU os recursos rodam, mais devagar.

### Primeira vez

```bash
git clone https://github.com/AlexandreLPA/tieia.git
cd tieia
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
bun install
node apps/desktop/build-web.js
```

O `build-web.js` monta o editor para o app (em `apps/web/.next-desktop`).
Rode de novo depois de mudar o código web.

### Uso diário

```bash
apps/desktop/node_modules/electron/dist/electron.exe apps/desktop
```

Um atalho na área de trabalho para esse comando é o jeito mais fácil de abrir.
Na primeira vez, abra a "Configuração de IA" e instale os pacotes que quiser;
cada um baixa as bibliotecas uma vez (de 2 a 8 GB). Para um LLM na nuvem, crie
uma chave em [openrouter.ai/keys](https://openrouter.ai/keys) e cole no app;
ela fica salva só no seu computador.

### Com Docker (jeito antigo)

Os serviços também rodam no Docker, que era como a Tiê AI rodava antes do app
de desktop. O Docker roda os serviços de IA, o PostgreSQL e o Redis, e um
launcher serve o editor em `127.0.0.1:3100`:

```bash
docker compose build
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1        # build de produção
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1 -Stop  # desliga o editor e os serviços do Docker

# Tudo no Docker, inclusive o editor
docker compose --profile docker-web up -d --build web

# TurboQuant e Chatterbox na GPU
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Nesse jeito, o backend de LLM também pode ser escolhido com `AI_LLM_BACKEND` no
`.env` (`auto`, `ollama`, `turboquant` ou `openrouter`).

### Testes

```bash
bun test
cd services/ai-backend && python -m pytest   # precisa do requirements.txt e do requirements-dev.txt instalados
```

## Privacidade

O que fica no seu computador:

- Seus vídeos, imagens, áudios e projetos (armazenamento do app).
- Transcrição, clonagem de voz, síntese de fala, separação de locutores,
  rastreamento de rosto, tradução, geração de imagens, pesquisa CLIP e o LLM
  local (TurboQuant, ou o Ollama se você o rodar).

O que sai, e só quando você usa:

| Recurso | Destino | O que é enviado |
|---|---|---|
| LLM na nuvem (um modelo da nuvem escolhido no chat) | OpenRouter e o provedor do modelo | Prompts, transcrições, o contexto do projeto aberto e, na Pontuação Viral e na verificação do TikTok Shop, quadros do vídeo |
| Painel de GIFs e figurinhas | KLIPY, chamada pelo navegador com a sua chave | Termos de busca. Os resultados são exibidos, não guardados |
| Figurinhas, ícones e fontes | Iconify e Google Fonts, chamados pelo navegador | Buscas de ícones e pedidos de fontes |
| Criar vídeo com IA | Pexels (sua chave), Wikimedia Commons | Termos de busca de imagens de banco |
| Links do YouTube que você cola | YouTube | Um pedido de download (yt-dlp) |
| Geração de vídeo com IA | Replicate ou PiAPI (sua chave) | Prompt e imagem de origem |
| Vozes e transcrição da Sarvam AI / Smallest AI | Sarvam, Smallest (sua chave) | Texto ou áudio |
| Busca de sons | Freesound (sua chave) | Termos de busca |
| Publicar no TikTok | TikTok, depois do seu login | O vídeo exportado |
| Instalar um pacote ou um modelo | PyPI, índice de pacotes do PyTorch, Hugging Face | Pedidos de download (nenhum dado do projeto) |

Sem nenhuma chave configurada, nenhum texto, áudio ou vídeo vai para um
provedor de IA.

## Por que o nome

O tiê-sangue (*Ramphocelus bresilius*) é um pássaro vermelho vivo da Mata
Atlântica, comum no Rio de Janeiro. Tiê AI é o tiê mais AI (inteligência artificial). O ícone é o pássaro
desenhado num traço branco único sobre o vermelho, com um botão de play no
bico. Onde acento não vale (código, URLs, nomes de pacote), o nome se escreve
`tieia`.

## Licença e créditos

MIT. Veja o [LICENSE](LICENSE), que mantém os avisos de copyright dos
projetos de onde a Tiê AI veio.

- [OpenCut](https://github.com/OpenCut-app/OpenCut), dos contribuidores do
  OpenCut: o editor de vídeo no coração da Tiê AI.
- [OpenCut AI](https://github.com/Ekaanth/OpenCut-AI), de
  [Ekaanth](https://github.com/Ekaanth): os serviços e recursos de IA
  construídos em volta do OpenCut.

A Tiê AI é mantida por [Alexandre](https://github.com/AlexandreLPA).
