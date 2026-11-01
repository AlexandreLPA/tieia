<p align="center">
  <img src="apps/web/public/icons/icon-192x192.png" alt="Logo da TiêIA" width="96" />
</p>

<h1 align="center">TiêIA</h1>

<p align="center">
  Editor de vídeo open source, com IA no centro e tudo rodando na sua máquina. Um fork do OpenCut.
</p>

<p align="center">
  <a href="README.md">Read in English</a>
</p>

---

A TiêIA é um editor de vídeo no navegador com um conjunto de ferramentas de
IA embutido. O editor roda no seu computador, os modelos de IA rodam em
containers Docker no seu computador, e os projetos ficam guardados no
navegador. Só vai para a internet o que você ligar, como um LLM na nuvem pela
[OpenRouter](https://openrouter.ai/) ou a busca de GIFs da
[KLIPY](https://klipy.com/) (veja [Privacidade](#privacidade)).

A interface é em português do Brasil e o foco é vídeo curto: YouTube Shorts,
Reels, TikTok e vídeos de venda do TikTok Shop.

A TiêIA é um fork do [OpenCut AI](https://github.com/Ekaanth/OpenCut-AI), que
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
- **Separação de locutores**, **rastreamento de rosto** para reenquadrar em
  9:16, **tradução local** e **geração de imagens local**, cada um no seu
  serviço.

Em desenvolvimento:

- **Busca híbrida de cenas** nas transcrições (lexical + semântica). Ainda não
  faz parte desta branch.

## Arquitetura

```
Navegador (janela de app do Edge, http://localhost:3100)
  └─ Editor Next.js (apps/web), roda direto no Windows, só em 127.0.0.1
       ├─ projetos e mídia: armazenamento do navegador (IndexedDB / OPFS)
       ├─ busca de GIFs da KLIPY ───────────────────────► api.klipy.com
       └─ chamadas de IA ──► ai-backend (FastAPI, :8420), o gateway
                               ├─ whisper-service    :8421  faster-whisper (GPU)
                               ├─ tts-service        :8422  Coqui TTS
                               ├─ image-service      :8423  diffusers
                               ├─ speaker-service    :8424  pyannote
                               ├─ face-service       :8425  MediaPipe
                               ├─ clip-service       :8426  embeddings CLIP
                               ├─ translate-service  :8427  NLLB-200
                               ├─ chatterbox-service :8428  clonagem de voz (GPU)
                               ├─ turboquant-service :8430  LLMs locais (Hugging Face)
                               ├─ ollama             :11434 LLMs locais (GGUF)
                               └─ OpenRouter (opcional) ──► openrouter.ai
O Docker também roda o PostgreSQL e o Redis.
```

Tudo o que roda no Docker publica as portas só em `127.0.0.1`.

O backend de LLM é escolhido com `AI_LLM_BACKEND` no `.env`:

| Valor | O que roda |
|---|---|
| `auto` (padrão) | TurboQuant local, com o Ollama de reserva |
| `ollama` | Ollama local (modelos GGUF) |
| `turboquant` | Serviço TurboQuant local (modelos Hugging Face em 4 bits, cache KV comprimido) |
| `openrouter` | Um modelo na nuvem pela OpenRouter, com a sua chave |

Com a OpenRouter, os modelos pagos ficam bloqueados a menos que
`OPENROUTER_ALLOW_PAID=true`. Se um modelo falhar, o backend tenta os
próximos modelos grátis.

## Como rodar

### Requisitos

- Windows 11 com o [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  (backend WSL 2).
- [Bun](https://bun.sh/).
- Uma GPU NVIDIA com o suporte a GPU ligado no Docker Desktop. O
  `docker-compose.yml` reserva a GPU para o serviço do Whisper
  (`WHISPER_DEVICE=cuda`), e o Chatterbox a usa pelo
  `docker-compose.gpu.yml`.

### Primeira vez

```bash
git clone https://github.com/AlexandreLPA/tieia.git
cd tieia
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

Para usar um LLM na nuvem, crie uma chave em
[openrouter.ai/keys](https://openrouter.ai/keys) e coloque no `.env` (nunca
faça commit desse arquivo):

```env
AI_LLM_BACKEND=openrouter
OPENROUTER_API_KEY=<sua chave>
```

Depois, construa os serviços de IA uma vez:

```bash
docker compose build
```

### Uso diário (modo híbrido)

O launcher abre o Docker Desktop se precisar, sobe os serviços de IA, o banco
e o Redis, refaz o build do editor quando o código dele mudou (cerca de 30 s)
e serve o editor escondido em `127.0.0.1:3100`. Depois abre uma janela de app
do Edge.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1        # build de produção
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1 -Dev   # next dev, hot reload
powershell -ExecutionPolicy Bypass -File scripts/start-opencut.ps1 -Stop  # desliga o editor e os serviços do Docker
```

- O log do editor fica em `%LOCALAPPDATA%\OpenCut-AI\editor.log`.
- `-NoBrowser` liga sem abrir janela.
- Mantenha a porta **3100**: os projetos ficam no armazenamento do navegador
  por endereço, e outra porta mostra a lista de projetos vazia.
- Um atalho na área de trabalho pode rodar o mesmo comando; com `-Stop`, vira
  o atalho de fechar.

### Outros jeitos de rodar

```bash
# Tudo no Docker, inclusive o editor
docker compose --profile docker-web up -d --build web

# Refazer o backend depois de mudar o código dele
docker compose up -d --build ai-backend

# TurboQuant e Chatterbox na GPU
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

### Testes

```bash
bun test
cd services/ai-backend && python -m pytest   # precisa do requirements.txt e do requirements-dev.txt instalados
```

## Privacidade

O que fica no seu computador:

- Seus vídeos, imagens, áudios e projetos (armazenamento do navegador).
- Transcrição, clonagem de voz, síntese de fala, separação de locutores,
  rastreamento de rosto, tradução, geração de imagens, pesquisa CLIP e os
  LLMs locais (Ollama, TurboQuant).

O que sai, e só quando você usa:

| Recurso | Destino | O que é enviado |
|---|---|---|
| LLM na nuvem (`AI_LLM_BACKEND=openrouter`) | OpenRouter e o provedor do modelo | Prompts, transcrições, o contexto do projeto aberto e, na Pontuação Viral e na verificação do TikTok Shop, quadros do vídeo |
| Painel de GIFs e figurinhas | KLIPY, chamada pelo navegador com a sua chave | Termos de busca. Os resultados são exibidos, não guardados |
| Figurinhas, ícones e fontes | Iconify e Google Fonts, chamados pelo navegador | Buscas de ícones e pedidos de fontes |
| Criar vídeo com IA | Pexels (sua chave), Wikimedia Commons | Termos de busca de imagens de banco |
| Links do YouTube que você cola | YouTube | Um pedido de download (yt-dlp) |
| Geração de vídeo com IA | Replicate ou PiAPI (sua chave) | Prompt e imagem de origem |
| Vozes e transcrição da Sarvam AI / Smallest AI | Sarvam, Smallest (sua chave) | Texto ou áudio |
| Busca de sons | Freesound (sua chave) | Termos de busca |
| Publicar no TikTok | TikTok, depois do seu login | O vídeo exportado |

Com o padrão `AI_LLM_BACKEND=auto` e nenhuma chave configurada, nenhum texto,
áudio ou vídeo vai para um provedor de IA.

## Por que o nome

O tiê-sangue (*Ramphocelus bresilius*) é um pássaro vermelho vivo da Mata
Atlântica, comum no Rio de Janeiro. TiêIA é o tiê mais IA. O ícone é o pássaro
desenhado num traço branco único sobre o vermelho, com um botão de play no
bico. Onde acento não vale (código, URLs, nomes de pacote), o nome se escreve
`tieia`.

## Licença e créditos

MIT. Veja o [LICENSE](LICENSE), que mantém os avisos de copyright dos
projetos de onde a TiêIA veio.

- [OpenCut](https://github.com/OpenCut-app/OpenCut), dos contribuidores do
  OpenCut: o editor de vídeo no coração da TiêIA.
- [OpenCut AI](https://github.com/Ekaanth/OpenCut-AI), de
  [Ekaanth](https://github.com/Ekaanth): os serviços e recursos de IA
  construídos em volta do OpenCut.

A TiêIA é mantida por [Alexandre](https://github.com/AlexandreLPA).
