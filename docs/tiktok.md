# Enviar ao TikTok

Depois de exportar, a janela de exportação mostra **Enviar ao TikTok**, em duas camadas:

1. **Sempre disponível:** "Postar pelo site do TikTok" abre `https://www.tiktok.com/upload` numa aba nova. O MP4 já foi salvo na pasta Downloads pela exportação; é só escolher o arquivo lá. Se o projeto não for 9:16, aparece um aviso antes.
2. **Com as chaves do TikTok configuradas:** "Conectar conta do TikTok" e depois "Enviar para o app do TikTok". O vídeo vai pela Content Posting API (escopo `video.upload`, upload para a caixa de entrada, não Direct Post). No fim: abra o app do TikTok, toque na notificação e poste.

Sem `TIKTOK_CLIENT_KEY` e `TIKTOK_CLIENT_SECRET`, a camada 2 fica escondida.

## Endereço de retorno (redirect URI)

O Login Kit **Web** exige redirect URI em `https` ([doc](https://developers.tiktok.com/doc/login-kit-web)), então não serve para `http://localhost:3100`.
O Login Kit **Desktop** aceita `http://localhost` e `http://127.0.0.1` com porta, usando PKCE ([doc](https://developers.tiktok.com/doc/login-kit-desktop)). O OpenCut usa esse fluxo.

Cadastre exatamente (sem barra no fim):

```
http://localhost:3100/api/tiktok/auth/callback
http://127.0.0.1:3100/api/tiktok/auth/callback
```

O editor monta o endereço a partir de onde foi aberto. Para outro endereço, defina `TIKTOK_REDIRECT_URI`.
Se o portal do TikTok recusar o endereço local, a alternativa documentada é o Login Kit Web com um domínio público em `https`, apontando `TIKTOK_REDIRECT_URI` para ele. Esse caminho não foi implementado nem testado aqui.

## Passo a passo para criar o app

1. Entre em https://developers.tiktok.com com sua conta do TikTok e crie uma conta de desenvolvedor.
2. Em **Manage apps**, crie um app. Preencha nome, ícone, categoria e descrição.
3. Em **Platforms**, marque **Desktop**.
4. Em **Products**, adicione **Login Kit** e **Content Posting API**. Na Content Posting API, deixe **Direct Post desligado**.
5. Em **Scopes**, confira `user.info.basic` e `video.upload`.
6. No Login Kit, cadastre os dois redirect URIs acima.
7. **Sandbox (para testar antes da aprovação):** ligue a chave **Sandbox** ao lado do nome do app, clique em **Create Sandbox**, configure os mesmos produtos e clique em **Apply changes**. Em **Sandbox settings → Target users**, adicione sua própria conta (até 10 contas suas). A lista pode levar até 1 hora para atualizar. ([doc](https://developers.tiktok.com/doc/add-a-sandbox)). A documentação diz que o sandbox não dá acesso a vídeos públicos; não diz explicitamente se o envio para a caixa de entrada funciona nele.
8. Copie **Client key** e **Client secret** (do sandbox, para testar; do app em produção, depois da aprovação).
9. Coloque em `apps/web/.env.local`:

   ```
   TIKTOK_CLIENT_KEY=...
   TIKTOK_CLIENT_SECRET=...
   ```

   No Docker (`--profile docker-web`), passe as mesmas variáveis no ambiente.
10. Reinicie o editor: atalho "Fechar OpenCut" e abra de novo (ou `scripts/start-opencut.ps1 -Stop` e depois sem `-Stop`).
11. Para uso fora do sandbox, envie o app para revisão (**Submit for review**). O TikTok pede política de privacidade, termos e um vídeo mostrando o fluxo.

## Detalhes

- O token fica só no servidor, criptografado com uma chave derivada do `TIKTOK_CLIENT_SECRET`, em `%LOCALAPPDATA%\OpenCut-AI\tiktok-account.json` (ou `OPENCUT_DATA_DIR`). Nunca vai para o localStorage.
- Envio: `POST /v2/post/publish/inbox/video/init/` só com `source_info`; partes de 10 MiB (mínimo 5 MB, máximo 64 MB, a última até 128 MB, parte única abaixo de 5 MB), em ordem, com `Content-Range`; depois `POST /v2/post/publish/status/fetch/` a cada 3 s. A lógica está em `apps/web/src/lib/tiktok/chunks.ts`, com testes.
- Limites do TikTok: no máximo 5 envios pendentes na caixa de entrada por 24 h; o `upload_url` vale 1 hora.
