"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	CheckmarkCircle02Icon,
	Mic01Icon,
	StopIcon,
	Upload04Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { aiClient } from "@/lib/ai-client";
import { describeSimilarity } from "@/lib/voiceover/chatterbox";
import { DEFAULT_VOICE_TUNING, voiceLabel } from "@/lib/voiceover/voice-preferences";
import type { ReferenceAnalysis } from "@/types/ai";
import { cn } from "@/utils/ui";

/** About 15 s read at a calm pace: enough for Chatterbox, which reads the first 10 s */
const READING_SCRIPT =
	"Oi! Estou gravando a minha voz para usar nos meus vídeos. Vou falar com calma, do meu jeito natural, como se estivesse contando uma novidade para um amigo. Hoje eu quero mostrar uma coisa que vale muito a pena conferir.";
const GOOD_SECONDS = 12;
const TEST_SENTENCE = "Oi! Esta é a minha voz clonada no OpenCut. Ficou parecida?";

const STATUS_DOT = {
	ok: "bg-green-500",
	warn: "bg-yellow-500",
	info: "bg-blue-500",
} as const;

type Step = "source" | "review";

export interface ClonedVoice {
	/** Saved name (file stem), the key for list, settings and deletion */
	name: string;
	path: string;
}

/** A name not taken yet: "Minha voz", "Minha voz 2"... */
function freeName(base: string, taken: string[]): string {
	const used = new Set(taken.map((name) => voiceLabel(name).toLowerCase()));
	if (!used.has(base.toLowerCase())) return base;
	for (let n = 2; ; n++) {
		const candidate = `${base} ${n}`;
		if (!used.has(candidate.toLowerCase())) return candidate;
	}
}

/**
 * Creating a cloned voice, the way voice tools usually do it: record (with a
 * text to read) or upload, give it a name, confirm consent; then see how good
 * the recording is and hear a test before using it.
 */
export function CloneVoiceDialog({
	open,
	onOpenChange,
	existingNames,
	onCloned,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	existingNames: string[];
	onCloned: (voice: ClonedVoice) => void;
}) {
	const [step, setStep] = useState<Step>("source");
	const [file, setFile] = useState<File | null>(null);
	const [name, setName] = useState("");
	const [consent, setConsent] = useState(false);
	const [saving, setSaving] = useState(false);
	const [voice, setVoice] = useState<ClonedVoice | null>(null);
	const [analysis, setAnalysis] = useState<ReferenceAnalysis | null>(null);
	const [testing, setTesting] = useState(false);
	const [test, setTest] = useState<{ url: string; similarity: number | null } | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const recorder = useVoiceRecorder({ onRecorded: setFile });
	const recording = recorder.state === "recording";
	const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
	useEffect(() => () => {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	}, [previewUrl]);
	useEffect(() => () => {
		if (test) URL.revokeObjectURL(test.url);
	}, [test]);

	// Every opening starts over, with a name that is free
	// biome-ignore lint/correctness/useExhaustiveDependencies: the taken names only matter when the dialog opens
	useEffect(() => {
		if (!open) return;
		setStep("source");
		setFile(null);
		setConsent(false);
		setVoice(null);
		setAnalysis(null);
		setTest(null);
		setName(freeName("Minha voz", existingNames));
	}, [open]);

	const close = (next: boolean) => {
		if (saving || recording) return;
		// Closed after cloning: the voice is saved, so the panel still lists it
		if (!next && voice) onCloned(voice);
		onOpenChange(next);
	};

	const handleClone = async () => {
		if (!file) return;
		setSaving(true);
		try {
			const result = await aiClient.cloneChatterboxVoice(file, name.trim());
			// The service saves "Minha voz" as Minha_voz.wav; that stem is the voice's key
			const saved = result.path.split(/[\\/]/).pop()?.replace(/\.wav$/i, "") ?? result.name;
			const cloned = { name: saved, path: result.path };
			setVoice(cloned);
			setStep("review");
			setAnalysis(await aiClient.analyzeChatterboxReference(result.path));
		} catch (error) {
			toast.error("Não foi possível clonar a voz", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setSaving(false);
		}
	};

	const handleTest = async () => {
		if (!voice) return;
		setTesting(true);
		try {
			const take = await aiClient.generateChatterbox({
				text: TEST_SENTENCE,
				language: "pt",
				speakerWav: voice.path,
				...DEFAULT_VOICE_TUNING,
			});
			setTest({ url: URL.createObjectURL(take.blob), similarity: take.similarity });
		} catch (error) {
			toast.error("O teste não saiu", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setTesting(false);
		}
	};

	const finish = () => {
		if (voice) onCloned(voice);
		onOpenChange(false);
	};

	/** Back to recording: the saved voice is replaced when it is cloned again under the same name */
	const recordAgain = () => {
		setStep("source");
		setFile(null);
		setAnalysis(null);
		setTest(null);
		if (voice) setName(voiceLabel(voice.name));
	};

	const warnings = analysis?.checks.filter((check) => check.status === "warn").length ?? 0;
	const tooShort = recorder.seconds < GOOD_SECONDS;

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{step === "source" ? "Clonar uma voz" : "Confira a voz"}</DialogTitle>
					<DialogDescription>
						{step === "source"
							? "Grave ou envie 10 a 15 s de fala. A voz fica salva neste computador para os próximos vídeos."
							: "Veja se a gravação ficou boa e ouça um teste antes de usar."}
					</DialogDescription>
				</DialogHeader>

				{step === "source" ? (
					<DialogBody className="gap-4">
						<div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
							<p className="text-xs font-medium">Leia em voz alta, com calma:</p>
							<p className="text-sm leading-relaxed">{READING_SCRIPT}</p>
						</div>

						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant={recording ? "destructive" : "default"}
									className="gap-1.5"
									disabled={recorder.state === "processing" || saving}
									onClick={recording ? recorder.stop : recorder.start}
								>
									<HugeiconsIcon icon={recording ? StopIcon : Mic01Icon} className="size-4" />
									{recording ? "Parar" : file ? "Gravar de novo" : "Gravar"}
								</Button>
								<span className="text-xs text-muted-foreground">ou</span>
								<Button
									type="button"
									variant="outline"
									className="gap-1.5"
									disabled={recording || saving}
									onClick={() => fileInputRef.current?.click()}
								>
									<HugeiconsIcon icon={Upload04Icon} className="size-4" />
									Enviar um áudio
								</Button>
								<input
									ref={fileInputRef}
									type="file"
									accept=".wav,.mp3,.flac,.ogg,.m4a,audio/*"
									className="hidden"
									onChange={(event) => {
										const picked = event.target.files?.[0];
										if (picked) setFile(picked);
										event.target.value = "";
									}}
								/>
							</div>

							{recording && (
								<div className="flex flex-col gap-1.5" aria-live="polite">
									<div className="flex items-center justify-between text-xs">
										<span className="flex items-center gap-1.5">
											<span className="size-2 animate-pulse rounded-full bg-red-500" />
											Gravando
										</span>
										<span className="tabular-nums text-muted-foreground">
											{Math.floor(recorder.seconds)} s
											{tooShort ? ` — continue até ${GOOD_SECONDS} s` : " — pode parar"}
										</span>
									</div>
									<div className="h-1.5 overflow-hidden rounded-full bg-muted">
										<div
											className="h-full bg-primary transition-[width] duration-75"
											style={{ width: `${Math.round(recorder.level * 100)}%` }}
										/>
									</div>
								</div>
							)}
							{recorder.state === "processing" && (
								<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<Spinner className="size-3" /> Preparando a gravação...
								</p>
							)}
							{recorder.error && <p className="text-xs text-destructive">{recorder.error}</p>}

							{file && previewUrl && !recording && (
								<div className="flex flex-col gap-1 rounded-md border p-2">
									<p className="text-[11px] text-muted-foreground truncate">
										{file.name === "gravacao.wav" ? "Sua gravação" : file.name}
									</p>
									<audio src={previewUrl} controls className="h-8 w-full">
										<track kind="captions" />
									</audio>
								</div>
							)}
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="clone-voice-name">Nome da voz</Label>
							<Input
								id="clone-voice-name"
								value={name}
								maxLength={40}
								onChange={(event) => setName(event.target.value)}
							/>
						</div>

						<div className="flex items-start gap-2">
							<Checkbox
								id="clone-voice-consent"
								checked={consent}
								onCheckedChange={(checked) => setConsent(checked === true)}
							/>
							<Label htmlFor="clone-voice-consent" className="text-xs font-normal leading-relaxed">
								A voz é minha, ou a pessoa autorizou o uso dela.
							</Label>
						</div>
					</DialogBody>
				) : (
					<DialogBody className="gap-4">
						{!analysis ? (
							<p className="flex items-center gap-2 text-sm text-muted-foreground">
								<Spinner className="size-4" /> Conferindo a gravação...
							</p>
						) : (
							<div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
								<p className="flex items-center gap-1.5 text-sm font-medium">
									{warnings === 0 ? (
										<>
											<HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-green-500" />
											Gravação boa para clonar
										</>
									) : (
										<>
											<span className="size-2 rounded-full bg-yellow-500" />
											Dá para melhorar ({warnings} {warnings === 1 ? "ponto" : "pontos"})
										</>
									)}
								</p>
								{analysis.checks.map((check) => (
									<div key={check.id} className="flex items-start gap-1.5">
										<span
											className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", STATUS_DOT[check.status])}
										/>
										<span className="text-xs leading-relaxed">{check.advice}</span>
									</div>
								))}
							</div>
						)}

						<div className="flex flex-col gap-2">
							<p className="text-xs text-muted-foreground">Teste: “{TEST_SENTENCE}”</p>
							{test ? (
								<>
									<audio src={test.url} controls autoPlay className="h-8 w-full">
										<track kind="captions" />
									</audio>
									{test.similarity !== null && (
										<p className="text-xs">
											Semelhança: {describeSimilarity(test.similarity).text}
										</p>
									)}
								</>
							) : (
								<Button
									type="button"
									variant="outline"
									className="self-start gap-1.5"
									disabled={testing || !analysis}
									onClick={handleTest}
								>
									{testing ? (
										<>
											<Spinner className="size-3.5" /> Gerando o teste...
										</>
									) : (
										"Ouvir um teste"
									)}
								</Button>
							)}
							{testing && (
								<p className="text-[11px] text-muted-foreground">
									Na primeira vez o modelo de voz é carregado e pode levar alguns minutos.
								</p>
							)}
						</div>
					</DialogBody>
				)}

				<DialogFooter>
					{step === "source" ? (
						<>
							<Button variant="ghost" onClick={() => close(false)} disabled={saving || recording}>
								Cancelar
							</Button>
							<Button
								onClick={handleClone}
								disabled={!file || !consent || !name.trim() || saving || recording}
							>
								{saving && <Spinner className="mr-1 size-3.5" />}
								Clonar voz
							</Button>
						</>
					) : (
						<>
							<Button variant="ghost" onClick={recordAgain} disabled={testing}>
								Gravar de novo
							</Button>
							<Button onClick={finish} disabled={!voice || testing}>
								Usar esta voz
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
