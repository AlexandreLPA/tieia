"use client";

import { useState } from "react";
import { SOCIAL_LINKS } from "@/constants/site-constants";
import { useLocalStorage } from "@/hooks/storage/use-local-storage";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "../ui/dialog";
import { useAIStatus } from "@/hooks/use-ai-status";
import { useAIStore } from "@/stores/ai-store";
import { cn } from "@/utils/ui";

export function Onboarding() {
	const [step, setStep] = useState(0);
	const [hasSeenOnboarding, setHasSeenOnboarding] = useLocalStorage({
		key: "hasSeenOnboarding-v2",
		defaultValue: false,
	});
	const { isConnected } = useAIStatus();
	const toggleSetupGuide = useAIStore((s) => s.toggleSetupGuide);

	const isOpen = !hasSeenOnboarding;

	const handleNext = () => setStep(step + 1);
	const handleClose = () => setHasSeenOnboarding({ value: true });

	const handleOpenSetup = () => {
		handleClose();
		toggleSetupGuide();
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-md">
				<DialogTitle>
					<span className="sr-only">Bem-vindo ao OpenCut AI</span>
				</DialogTitle>
				<DialogBody>
					{step === 0 && (
						<div className="flex flex-col gap-5">
							<div className="flex flex-col gap-2">
								<h2 className="text-lg font-bold">Bem-vindo ao OpenCut AI</h2>
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
								<Button onClick={handleNext} className="flex-1">
									{isConnected ? "Começar" : "Pular por enquanto"}
								</Button>
							</div>
						</div>
					)}

					{step === 2 && (
						<div className="flex flex-col gap-5">
							<div className="flex flex-col gap-2">
								<h2 className="text-lg font-bold">Tudo pronto</h2>
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
