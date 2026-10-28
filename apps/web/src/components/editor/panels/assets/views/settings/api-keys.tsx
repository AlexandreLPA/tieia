"use client";

import { useCallback, useState } from "react";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/ui";


// ----- API Keys Section -----

const API_KEY_FIELDS = [
	{
		key: "FREESOUND_CLIENT_ID",
		label: "ID de cliente do Freesound",
		placeholder: "Seu ID de cliente",
		description: "Busca na biblioteca de sons",
		envVar: "FREESOUND_CLIENT_ID",
		envValue: process.env.FREESOUND_CLIENT_ID || "",
		info: "Permite buscar e explorar milhares de sons gratuitos da biblioteca Freesound. Obtenha sua chave em freesound.org/apiv2/apply",
		required: true,
	},
	{
		key: "FREESOUND_API_KEY",
		label: "Chave de API do Freesound",
		placeholder: "Sua chave de API",
		description: "Pré-visualização e download de sons",
		envVar: "FREESOUND_API_KEY",
		envValue: process.env.FREESOUND_API_KEY || "",
		info: "Necessária para pré-visualizar e baixar sons do Freesound. Sem essa chave, o painel de sons não retornará resultados.",
		required: true,
	},
	{
		key: "sarvam",
		label: "Chave de API do Sarvam AI",
		placeholder: "sk_...",
		description: "Transcrição, tradução e TTS para idiomas indianos",
		envVar: "OPENCUTAI_SARVAM_API_KEY",
		// Audit finding H-3: env fallbacks that expose keys to every visitor's
		// browser bundle were removed; server-side keys are configured on the
		// backend, not shipped to the client.
		envValue: "",
		info: "Permite transcrição, tradução e conversão de texto em fala (TTS) para 22 idiomas regionais indianos (hindi, bengali, tâmil, telugu, etc.) via Sarvam AI. Obtenha sua chave em dashboard.sarvam.ai — créditos gratuitos ao se cadastrar.",
		required: false,
	},
	{
		key: "smallest",
		label: "Chave de API do Smallest AI",
		placeholder: "Sua chave do Smallest AI",
		description: "Lightning TTS (15 idiomas, mais de 80 vozes) e Pulse STT (39 idiomas)",
		envVar: "OPENCUTAI_SMALLEST_API_KEY",
		envValue: "",
		info: "Permite conversão de texto em fala com latência ultrabaixa e mais de 80 vozes naturais em 15 idiomas, além de conversão de fala em texto com suporte a 39 idiomas, identificação de locutor e detecção de emoções. Obtenha sua chave em app.smallest.ai.",
		required: false,
	},
	{
		key: "pexels",
		label: "Chave de API do Pexels",
		placeholder: "Sua chave de API do Pexels",
		description: "Fotos de banco de imagens gratuitas para sugestões de B-roll",
		envVar: "PEXELS_API_KEY",
		envValue: process.env.PEXELS_API_KEY || "",
		info: "Permite a busca de fotos de banco de imagens nas sugestões de B-roll. O Pexels oferece fotos gratuitas de alta qualidade, com 200 solicitações por hora. Obtenha sua chave em pexels.com/api — cadastro instantâneo, sem necessidade de pagamento.",
		required: false,
	},
	{
		key: "seedance",
		label: "Chave de API do Seedance (PiAPI)",
		placeholder: "Sua chave PiAPI para o Seedance 2.0",
		description: "Geração de texto em vídeo via Seedance 2.0 (ByteDance)",
		envVar: "OPENCUTAI_SEEDANCE_API_KEY",
		envValue: "",
		info: "Permite gerar vídeos com IA a partir de prompts de texto usando o Seedance 2.0, da ByteDance. Acesso via PiAPI — obtenha sua chave em piapi.ai. Compatível com texto em vídeo nos formatos 16:9, 9:16, 1:1 e outros. Você também pode usar a geração local sem essa chave.",
		required: false,
	},
	{
		key: "replicate",
		label: "Token de API do Replicate",
		placeholder: "r8_...",
		description: "Acesse Runway Gen-3, Pika, Kling, MiniMax, Stable Video e mais de 10 outros modelos",
		envVar: "NEXT_PUBLIC_REPLICATE_API_TOKEN",
		envValue: "",
		info: "Uma única chave de API para mais de 10 modelos de geração de vídeo: Runway Gen-3 Alpha, Pika 1.0, Kling v1.6, MiniMax Video-01, Stable Video Diffusion e outros. Cobrança por uso. Obtenha seu token em replicate.com — $5 em créditos gratuitos ao se cadastrar.",
		required: false,
	},
	{
		key: "stability",
		label: "Chave de API do Stability AI",
		placeholder: "sk-...",
		description: "Stable Video Diffusion e futuros modelos de vídeo da Stability",
		envVar: "NEXT_PUBLIC_STABILITY_API_KEY",
		envValue: "",
		info: "Permite usar o Stable Video Diffusion para animação de imagem em vídeo e geração de texto em vídeo. Obtenha sua chave em platform.stability.ai — créditos gratuitos disponíveis.",
		required: false,
	},
	{
		key: "luma",
		label: "Chave de API do Luma AI",
		placeholder: "Sua chave do Luma AI",
		description: "Dream Machine — movimento realista e controle de câmera",
		envVar: "NEXT_PUBLIC_LUMA_API_KEY",
		envValue: "",
		info: "Permite usar o Luma Dream Machine para gerar vídeos de alta qualidade com movimento de câmera realista. Compatível com texto em vídeo e imagem em vídeo. Obtenha sua chave em lumalabs.ai.",
		required: false,
	},
];

export function APIKeysSection() {
	const [keys, setKeys] = useState<Record<string, string>>(() => {
		if (typeof window === "undefined") return {};
		try {
			const stored = localStorage.getItem("opencut-api-keys");
			return stored ? JSON.parse(stored) : {};
		} catch {
			return {};
		}
	});
	const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

	const toggleVisibility = useCallback((key: string) => {
		setVisibleKeys((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}, []);

	const handleSave = useCallback((key: string, value: string) => {
		setKeys((prev) => {
			const next = { ...prev, [key]: value };
			try {
				localStorage.setItem("opencut-api-keys", JSON.stringify(next));
			} catch {}
			return next;
		});
	}, []);

	const handleClear = useCallback((key: string) => {
		setKeys((prev) => {
			const next = { ...prev };
			delete next[key];
			try {
				localStorage.setItem("opencut-api-keys", JSON.stringify(next));
			} catch {}
			return next;
		});
	}, []);

	return (
		<div className="flex flex-col gap-3">
			<p className="text-[11px] text-muted-foreground leading-relaxed">
				Configure chaves de API para os serviços. As chaves são armazenadas localmente no seu navegador. Você também pode configurá-las no arquivo <code className="text-[10px] font-mono bg-muted px-1 rounded">.env.local</code>.
			</p>

			{API_KEY_FIELDS.map((field) => {
				const localValue = keys[field.key]?.trim() || "";
				const envValue = field.envValue?.trim() || "";
				const effectiveValue = localValue || envValue;
				const hasValue = !!effectiveValue;
				const isFromEnv = !localValue && !!envValue;
				const isVisible = visibleKeys.has(field.key);

				return (
					<div
						key={field.key}
						className={cn(
							"flex flex-col gap-1.5 rounded-lg border p-2.5",
							hasValue ? "border-green-500/20 bg-green-500/5" : field.required ? "border-yellow-500/20 bg-yellow-500/5" : "border-border",
						)}
					>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-1.5">
								<span
									className={cn(
										"size-1.5 rounded-full shrink-0",
										hasValue ? "bg-green-500" : field.required ? "bg-yellow-500" : "bg-muted-foreground/30",
									)}
								/>
								<Label className="text-[11px]">{field.label}</Label>
								{field.required && !hasValue && (
									<Badge variant="outline" className="text-[8px] px-1 py-0 text-yellow-500 border-yellow-500/30">
										Obrigatório
									</Badge>
								)}
								{isFromEnv && (
									<Badge variant="secondary" className="text-[8px] px-1 py-0">
										Do ambiente
									</Badge>
								)}
							</div>
							<div className="flex items-center gap-1">
								{/* Info popover */}
								<Popover>
									<PopoverTrigger asChild>
										<button
											type="button"
											className="size-4 rounded-full border text-[9px] font-bold text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center"
										>
											i
										</button>
									</PopoverTrigger>
									<PopoverContent side="left" align="start" className="w-64 p-3">
										<p className="text-xs leading-relaxed">{field.info}</p>
										<p className="text-[10px] text-muted-foreground mt-2 font-mono">
											Ambiente: {field.envVar}
										</p>
									</PopoverContent>
								</Popover>
								{hasValue && (
									<>
										<button
											type="button"
											className="text-[9px] text-muted-foreground hover:text-foreground px-1"
											onClick={() => toggleVisibility(field.key)}
										>
											{isVisible ? "Ocultar" : "Mostrar"}
										</button>
										{!isFromEnv && (
											<button
												type="button"
												className="text-[9px] text-destructive hover:text-destructive/80 px-1"
												onClick={() => handleClear(field.key)}
											>
												Limpar
											</button>
										)}
									</>
								)}
							</div>
						</div>

						{hasValue && !isVisible ? (
							<button type="button"
								className="w-full rounded-md border bg-muted/30 px-2.5 py-1.5 text-left text-[11px] font-mono text-muted-foreground cursor-default select-none"
								onClick={() => toggleVisibility(field.key)}
							>
								{"•".repeat(Math.min(effectiveValue.length, 24))}
							</button>
						) : (
							<input
								type={isVisible ? "text" : "password"}
								placeholder={field.placeholder}
								value={isFromEnv ? envValue : (localValue || "")}
								onChange={(e) => handleSave(field.key, e.target.value)}
								disabled={isFromEnv}
								className={cn(
									"w-full rounded-md border bg-transparent px-2.5 py-1.5 text-[11px] outline-none",
									"focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40",
									"font-mono",
									isFromEnv && "opacity-60 cursor-not-allowed",
								)}
							/>
						)}

						<p className="text-[10px] text-muted-foreground">{field.description}</p>
					</div>
				);
			})}
		</div>
	);
}
