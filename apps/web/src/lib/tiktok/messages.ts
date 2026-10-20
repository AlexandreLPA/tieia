/**
 * Portuguese messages for TikTok error codes and status fail reasons.
 * Codes: https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
 * and https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status
 */

const ERROR_MESSAGES: Record<string, string> = {
	access_token_invalid:
		"A conexão com o TikTok expirou. Conecte a conta de novo.",
	scope_not_authorized:
		"A conta foi conectada sem a permissão de envio de vídeos. Conecte de novo e aceite todas as permissões.",
	spam_risk_too_many_pending_share:
		"O TikTok aceita no máximo 5 vídeos pendentes na caixa de entrada por dia. Poste ou descarte os que estão lá e tente mais tarde.",
	spam_risk_user_banned_from_posting:
		"O TikTok bloqueou novas postagens desta conta.",
	rate_limit_exceeded:
		"Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.",
	invalid_param: "O TikTok recusou os dados do envio.",
	invalid_publish_id: "O TikTok não encontrou este envio.",
	token_not_authorized_for_specified_publish_id:
		"Este envio foi feito por outra conta do TikTok.",
};

const FAIL_REASON_MESSAGES: Record<string, string> = {
	file_format_check_failed:
		"O TikTok não aceitou o formato do arquivo. Exporte em MP4.",
	duration_check_failed:
		"A duração do vídeo está fora do limite aceito pelo TikTok.",
	frame_rate_check_failed:
		"O TikTok não aceitou a taxa de quadros do vídeo. Tente exportar a 30 fps.",
	picture_size_check_failed:
		"O TikTok não aceitou a resolução do vídeo.",
	internal: "Falha temporária no TikTok. Tente de novo em alguns minutos.",
	auth_removed: "O acesso do OpenCut à conta foi removido no TikTok.",
	spam_risk_too_many_posts:
		"Limite diário de postagens pela API atingido. Poste pelo app do TikTok.",
	spam_risk_user_banned_from_posting:
		"O TikTok bloqueou novas postagens desta conta.",
	spam_risk_text: "O TikTok marcou o envio como spam.",
	spam_risk: "O TikTok marcou o envio como arriscado.",
};

const RECONNECT_CODES = new Set([
	"access_token_invalid",
	"scope_not_authorized",
	"auth_removed",
]);

export function describeTikTokError({
	code,
	message,
}: {
	code?: string;
	message?: string;
}): string {
	if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
	const detail = message || code;
	return detail ? `O TikTok recusou o envio: ${detail}` : "O TikTok recusou o envio.";
}

export function describeFailReason(reason?: string): string {
	if (reason && FAIL_REASON_MESSAGES[reason]) return FAIL_REASON_MESSAGES[reason];
	return reason
		? `O TikTok não conseguiu processar o vídeo (${reason}).`
		: "O TikTok não conseguiu processar o vídeo.";
}

export function needsReconnect(code?: string): boolean {
	return !!code && RECONNECT_CODES.has(code);
}
