/** Outcome of the TikTok login, passed from the OAuth callback to /tiktok/connected. */
export type TikTokConnectResult =
	| "ok"
	| "denied"
	| "expired"
	| "state"
	| "scope"
	| "not_configured"
	| "error";

/** Same-origin channel the connected page uses to tell the editor tab. */
export const TIKTOK_CONNECT_CHANNEL = "opencut-tiktok-connect";

export const CONNECT_RESULT_MESSAGES: Record<TikTokConnectResult, string> = {
	ok: "Conta do TikTok conectada. Pode fechar esta aba e voltar ao editor.",
	denied: "Você não autorizou o acesso. Nada foi conectado.",
	expired:
		"O login demorou mais de 10 minutos ou foi aberto em outro endereço. Tente de novo pelo editor.",
	state: "A resposta do TikTok não confere com este login. Tente de novo pelo editor.",
	scope:
		"O TikTok não concedeu a permissão de enviar vídeos. Conecte de novo e mantenha essa permissão marcada.",
	not_configured:
		"O envio ao TikTok está desligado: faltam TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET.",
	error:
		"Não foi possível conectar ao TikTok. Confira se o endereço de retorno cadastrado no app do TikTok é igual ao do editor e tente de novo.",
};

export function parseConnectResult(value: unknown): TikTokConnectResult {
	return typeof value === "string" && Object.hasOwn(CONNECT_RESULT_MESSAGES, value)
		? (value as TikTokConnectResult)
		: "error";
}
