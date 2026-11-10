"use client";

import { useEffect, useState } from "react";
import { SOCIAL_LINKS } from "@/constants/site-constants";
import { useLocalStorage } from "@/hooks/storage/use-local-storage";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "../ui/dialog";
import { useAIStatus } from "@/hooks/use-ai-status";
import { useAIStore } from "@/stores/ai-store";
import { cn } from "@/utils/ui";
import { aiClient } from "@/lib/ai-client";
import { OpenRouterKeyForm } from "./ai/openrouter-key-form";

const STEP_KEY = 2;
const STEP_DONE = 3;

export function Onboarding() {
	const [step, setStep] = useState(0);
	const [hasSeenOnboarding, setHasSeenOnboarding] = useLocalStorage({
		key: "hasSeenOnboarding-v2",
		defaultValue: false,
	});
	const { isConnected } = useAIStatus();
	const toggleSetupGuide = useAIStore((s) => s.toggleSetupGuide);

	const isOpen = !hasSeenOnboarding;
	// null until the backend says whether a cloud key is already set
	const [hasCloudKey, setHasCloudKey] = useState<boolean | null>(null);
	const [cloudModel, setCloudModel] = useState<string | null>(null);

	useEffect(() => {
		if (!isOpen || !isConnected) return;
		aiClient
			.llmStatus()
			.then((status) => setHasCloudKey(status.openrouter_configured))
			.catch(() => setHasCloudKey(null));
	}, [isOpen, isConnected]);

	const handleNext = () => setStep(step + 1);
	// The key step needs the backend to save the key, and is pointless with one set
	const handleAfterBackend = () =>
		setStep(isConnected && hasCloudKey === false ? STEP_KEY : STEP_DONE);
	const handleClose = () => setHasSeenOnboarding({ value: true });

	const handleOpenSetup = () => {
		handleClose();
		toggleSetupGuide();
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>
					<span className="sr-only">Bem-vindo à TiêIA</span>
				</DialogTitle>
				<DialogBody>
					{step === 0 && (
						<div className="flex flex-col gap-5">
							<div className="flex flex-col gap-2">
								<h2 className="text-lg font-bold">Bem-vindo à TiêIA</h2>
								<p className="text-sm text-muted-foreground leading-relaxed">
									Este é um fork do OpenCut com IA adicionada. Edite vídeo
									por texto, gere imagens, clone vozes e comande a linha do
									tempo — instale localmente e tudo roda na sua máquina.
								</p>
							</div>

							<div className="flex flex-col gap-3">
								<StepItem
									number={1}
									title="Importe seu vídeo"
									description="Arraste um arquivo de vídeo para o editor ou use o painel de mídia"
								/>
								<StepItem
									number={2}
									title="Transcreva"
									description="Abra Legendas (ícone CC) na barra lateral e clique em Gerar transcrição"
								/>
								<StepItem
									number={3}
									title="Edite o texto"
									description="Exclua palavras, remova preenchimentos, reordene seções — o vídeo acompanha"
								/>
							</div>

							<Button onClick={handleNext} className="w-full">
								Próximo
							</Button>
						</div>
					)}

					{step === 1 && (
						<div className="flex flex-col gap-5">
							<div className="flex flex-col gap-2">
								<h2 className="text-lg font-bold">Um backend de IA local potencializa tudo</h2>
								<p className="text-sm text-muted-foreground leading-relaxed">
									Transcrição, clonagem de voz, geração de imagens e comandos
									em linguagem natural — tudo roda em um backend de IA local.
									Suas gravações nunca saem da sua máquina.
								</p>
							</div>

							{/* Connection status */}
							<div
								className={cn(
									"flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
									isConnected
										? "bg-green-500/10 text-green-400"
										: "bg-yellow-500/10 text-yellow-500",
								)}
							>
								<span
									className={cn(
										"size-2 rounded-full shrink-0",
										isConnected ? "bg-green-500" : "bg-yellow-500",
									)}
								/>
								{isConnected ? (
									<span>Backend de IA conectado — está tudo pronto</span>
								) : (
									<span>Backend de IA não está rodando — configure para desbloquear os recursos de IA</span>
								)}
							</div>

							<div className="flex gap-2">
								{!isConnected && (
									<Button
										variant="outline"
										onClick={handleOpenSetup}
										className="flex-1"
									>
										Configurar IA
									</Button>
								)}
								<Button onClick={handleAfterBackend} className="flex-1">
									{isConnected ? "Próximo" : "Pular por enquanto"}
								</Button>
							</div>
						</div>
					)}

					{step === STEP_KEY && (
						<div className="flex flex-col gap-5">
							<div className="flex flex-col gap-2">
								<h2 className="text-lg font-bold">
									Modelos de IA na nuvem (opcional)
								</h2>
								<p className="text-sm text-muted-foreground leading-relaxed">
									Insira sua chave da OpenRouter para o chat usar os modelos
									gratuitos dela, sem baixar nada. Crie a chave em{" "}
									<a
										href="https://openrouter.ai/keys"
										target="_blank"
										rel="noopener noreferrer"
										className="text-foreground underline hover:text-foreground/80"
									>
										openrouter.ai/keys
									</a>
									.
								</p>
								<p className="text-xs text-muted-foreground leading-relaxed">
									A chave fica salva só neste computador. Com um modelo da
									nuvem, o que você digita no chat vai para o provedor do
									modelo; seus vídeos continuam aqui.
								</p>
							</div>
							<OpenRouterKeyForm
								onSaved={(model) => {
									setCloudModel(model);
									setStep(STEP_DONE);
								}}
								onSkip={() => setStep(STEP_DONE)}
							/>
						</div>
					)}

					{step === STEP_DONE && (
						<div className="flex flex-col gap-5">
							<div className="flex flex-col gap-2">
								<h2 className="text-lg font-bold">Tudo pronto</h2>
								{cloudModel && (
									<p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">
										Chave salva. O chat responde com {cloudModel}.
									</p>
								)}
								<p className="text-sm text-muted-foreground leading-relaxed">
									Esta é uma beta inicial. Abra uma issue no{" "}
									<a
										href={SOCIAL_LINKS.github}
										target="_blank"
										rel="noopener noreferrer"
										className="text-foreground underline hover:text-foreground/80"
									>
										GitHub
									</a>{" "}
									para compartilhar feedback e ajudar a moldar o editor.
								</p>
							</div>

							<Button onClick={handleClose} className="w-full">
								Começar a editar
							</Button>
						</div>
					)}
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}

function StepItem({
	number,
	title,
	description,
}: {
	number: number;
	title: string;
	description: string;
}) {
	return (
		<div className="flex items-start gap-3">
			<div className="flex items-center justify-center size-7 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">
				{number}
			</div>
			<div>
				<p className="text-sm font-medium">{title}</p>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
		</div>
	);
}
