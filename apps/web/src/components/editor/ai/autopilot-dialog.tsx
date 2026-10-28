"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
	useAutopilot,
	type AutopilotAspect,
} from "@/hooks/use-autopilot";

const ASPECTS: { value: AutopilotAspect; label: string }[] = [
	{ value: "16:9", label: "16:9 Paisagem" },
	{ value: "9:16", label: "9:16 Vertical" },
	{ value: "1:1", label: "1:1 Quadrado" },
];

const LANGUAGES = [
	{ value: "pt", label: "Português" },
	{ value: "en", label: "English" },
	{ value: "es", label: "Español" },
];

const DURATIONS = [30, 45, 60, 90];

const FIELD_CLASS =
	"border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

export function AutopilotDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { state, run, reset } = useAutopilot();
	const [topic, setTopic] = useState("");
	const [duration, setDuration] = useState(45);
	const [language, setLanguage] = useState("pt");
	const [aspectRatio, setAspectRatio] = useState<AutopilotAspect>("16:9");

	const busy = state.stage === "planning" || state.stage === "building";

	const handleOpenChange = (next: boolean) => {
		if (busy) return;
		if (!next) reset();
		onOpenChange(next);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Criar vídeo com IA</DialogTitle>
					<DialogDescription>
						Da pesquisa ao roteiro e à timeline, a partir de um tema.
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="autopilot-topic">Tema</Label>
						<Textarea
							id="autopilot-topic"
							value={topic}
							onChange={(e) => setTopic(e.target.value)}
							placeholder="Ex.: 5 hábitos que melhoram o foco no trabalho"
							rows={3}
							disabled={busy}
						/>
					</div>
					<div className="grid grid-cols-3 gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="autopilot-duration">Duração</Label>
							<select
								id="autopilot-duration"
								className={FIELD_CLASS}
								value={duration}
								onChange={(e) => setDuration(Number(e.target.value))}
								disabled={busy}
							>
								{DURATIONS.map((d) => (
									<option key={d} value={d}>
										{d}s
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="autopilot-language">Idioma</Label>
							<select
								id="autopilot-language"
								className={FIELD_CLASS}
								value={language}
								onChange={(e) => setLanguage(e.target.value)}
								disabled={busy}
							>
								{LANGUAGES.map((l) => (
									<option key={l.value} value={l.value}>
										{l.label}
									</option>
								))}
							</select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="autopilot-aspect">Formato</Label>
							<select
								id="autopilot-aspect"
								className={FIELD_CLASS}
								value={aspectRatio}
								onChange={(e) => setAspectRatio(e.target.value as AutopilotAspect)}
								disabled={busy}
							>
								{ASPECTS.map((a) => (
									<option key={a.value} value={a.value}>
										{a.label}
									</option>
								))}
							</select>
						</div>
					</div>

					{state.stage !== "idle" && (
						<p
							className={
								state.stage === "error"
									? "text-destructive text-sm"
									: "text-muted-foreground text-sm"
							}
							role="status"
							aria-live="polite"
						>
							{state.sceneTotal > 0 && busy
								? `${state.sceneIndex}/${state.sceneTotal} · `
								: ""}
							{state.message}
						</p>
					)}

					{state.plan && state.plan.research.length > 0 && (
						<div className="bg-muted/50 max-h-36 overflow-y-auto rounded-md p-3 text-xs">
							<p className="mb-1 font-medium">Pesquisa (conhecimento do modelo)</p>
							<ul className="list-disc pl-4">
								{state.plan.research.map((fact) => (
									<li key={fact}>{fact}</li>
								))}
							</ul>
						</div>
					)}
				<p className="text-muted-foreground text-xs">
						A narração usa voz sintetizada (IA). Sem o serviço de voz local, o texto do
						roteiro é enviado ao serviço de voz online da Microsoft (edge-tts).
					</p>
				</DialogBody>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={busy}
					>
						{state.stage === "done" ? "Fechar" : "Cancelar"}
					</Button>
					<Button
						onClick={() => run({ topic: topic.trim(), duration, language, aspectRatio })}
						disabled={busy || topic.trim().length === 0}
					>
						{busy ? "Criando..." : "Criar vídeo"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
