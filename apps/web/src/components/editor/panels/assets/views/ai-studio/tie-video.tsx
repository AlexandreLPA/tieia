"use client";

import { useEffect, useRef, useState } from "react";
import {
	Add01Icon,
	Download04Icon,
	SentIcon,
	SlidersHorizontalIcon,
	Tick01Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ModelOriginBadge } from "@/components/editor/ai/model-origin-badge";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { useVideoGeneration } from "@/hooks/use-video-generation";
import { getApiKey } from "@/lib/api-keys";
import {
	VIDEO_ASPECT_RATIOS,
	VIDEO_MODELS,
	formatUsd,
	formatVideoCostPerSecond,
	getProviderConfig,
	getProviderLabel,
	isProviderKeyRequired,
	sortModelsByCost,
	type VideoGenMode,
	type VideoModel,
} from "@/lib/video-gen/video-gen-types";
import { cn } from "@/utils/ui";

const MODES: { id: VideoGenMode; label: string }[] = [
	{ id: "text-to-video", label: "Texto → vídeo" },
	{ id: "image-to-video", label: "Imagem → vídeo" },
	{ id: "video-to-video", label: "Vídeo → vídeo" },
];

const STARTERS = [
	"Drone sobrevoando uma praia ao amanhecer, movimento lento",
	"Close de café sendo servido numa xícara, luz de manhã",
	"Rua de cidade à noite na chuva, luzes refletidas no asfalto",
];

function originOf(model: VideoModel) {
	if (model.provider === "local") return "local" as const;
	return model.costPerSecondUsd === 0
		? ("cloud-free" as const)
		: ("cloud-paid" as const);
}

/** "≈ US$ 0,125" for the whole clip; null when it is free or billed in credits */
function estimate(model: VideoModel | undefined, seconds: number) {
	if (!model?.costPerSecondUsd) return null;
	return `≈ ${formatUsd(model.costPerSecondUsd * seconds)}`;
}

/**
 * Tiê Video: the same shape as Tiê Image. A description goes in the field at
 * the bottom and the clips appear above it; the kind of generation, the model,
 * the proportion and the duration stay behind the settings button.
 */
export function TieVideoPanel() {
	const video = useVideoGeneration();
	const {
		status,
		progress,
		jobs,
		error,
		selectedModel,
		selectedAspectRatio,
		duration,
		genMode,
		imageUrl,
	} = video;
	const [prompt, setPrompt] = useState("");
	// The description being worked on, shown before the provider answers
	const [sentPrompt, setSentPrompt] = useState<string | null>(null);
	// A paid clip waits here for a second click, so Enter alone never spends
	const [toConfirm, setToConfirm] = useState<string | null>(null);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const model = VIDEO_MODELS.find((entry) => entry.id === selectedModel);
	const providerConfig = model ? getProviderConfig(model.provider) : undefined;
	const needsKey =
		!!model &&
		isProviderKeyRequired(model.provider) &&
		!getApiKey(providerConfig?.apiKeyLocalStorageKey || "");
	const isBusy = status === "generating" || status === "polling";
	const price = estimate(model, duration);
	const models = sortModelsByCost(
		VIDEO_MODELS.filter((entry) => entry.supportedModes.includes(genMode)),
	);

	const threadLength = jobs.length + (sentPrompt ? 1 : 0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scrolls when the thread grows
	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
	}, [threadLength, status]);

	/** Keeps the proportion and the duration within what the model accepts. */
	const pickModel = (next: VideoModel) => {
		video.setSelectedModel(next.id);
		if (duration > next.maxDuration) video.setDuration(next.maxDuration);
		if (!next.aspectRatios.includes(selectedAspectRatio)) {
			video.setSelectedAspectRatio(next.aspectRatios[0] ?? "16:9");
		}
	};

	// The first thing seen should not be a warning: without a key for the
	// starting (paid) model, begin on one that needs no key
	// biome-ignore lint/correctness/useExhaustiveDependencies: decided once, when the panel mounts
	useEffect(() => {
		if (!needsKey) return;
		const keyless = VIDEO_MODELS.find(
			(entry) =>
				!isProviderKeyRequired(entry.provider) &&
				entry.supportedModes.includes(genMode),
		);
		if (keyless) pickModel(keyless);
	}, []);

	const pickMode = (next: VideoGenMode) => {
		video.setGenMode(next);
		if (model && !model.supportedModes.includes(next)) {
			const first = sortModelsByCost(
				VIDEO_MODELS.filter((entry) => entry.supportedModes.includes(next)),
			)[0];
			if (first) pickModel(first);
		}
	};

	const start = async (description: string) => {
		setToConfirm(null);
		setSentPrompt(description);
		setPrompt("");
		await video.generate(description);
	};

	const send = () => {
		const description = prompt.trim();
		if (!description || isBusy || !model || needsKey) return;
		if (genMode === "image-to-video" && !imageUrl.trim()) {
			setIsSettingsOpen(true);
			return;
		}
		if (originOf(model) === "cloud-paid") {
			setToConfirm(description);
			return;
		}
		start(description);
	};

	// Oldest first, like a conversation; the hook keeps the newest first
	const thread = [...jobs].reverse();
	const newest = jobs[0];
	// The provider has not answered yet, or refused before a clip was started
	const isPending =
		sentPrompt !== null &&
		(status === "generating" ||
			(status === "error" && newest?.prompt !== sentPrompt));
	const canSend = prompt.trim().length > 0 && !isBusy && !!model && !needsKey;

	return (
		<>
			<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
				{thread.length === 0 && !isPending ? (
					<div className="flex flex-col gap-3 py-4">
						<div className="text-center">
							<HugeiconsIcon
								icon={Video01Icon}
								className="text-muted-foreground/40 mx-auto mb-2 size-8"
							/>
							<p className="text-sm font-medium">Tiê Video</p>
							<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
								Descreva o clipe. O modelo, a proporção e a duração ficam no
								botão de configurações, ao lado do campo.
							</p>
						</div>
						<div className="flex flex-col gap-1.5">
							{STARTERS.map((starter) => (
								<button
									key={starter}
									type="button"
									onClick={() => setPrompt(starter)}
									className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-full border px-3 py-1.5 text-left text-xs"
								>
									{starter}
								</button>
							))}
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{thread.map((job) => {
							const jobModel = VIDEO_MODELS.find(
								(entry) => entry.id === job.model,
							);
							const isRunning =
								job.status === "processing" && job === newest && isBusy;
							return (
								<div key={job.id} className="flex flex-col gap-1.5">
									<p className="bg-primary text-primary-foreground ml-auto max-w-[85%] rounded-lg px-3 py-1.5 text-xs">
										{job.prompt}
									</p>
									{isRunning && (
										<div className="flex flex-col gap-1.5">
											<div className="bg-secondary h-1.5 overflow-hidden rounded-full">
												<div
													className="bg-primary h-full rounded-full transition-all duration-300"
													style={{ width: `${progress}%` }}
												/>
											</div>
											<p className="text-muted-foreground flex items-center gap-2 text-xs">
												<Spinner className="size-3" />
												Gerando o clipe… {progress}%
											</p>
										</div>
									)}
									{job.status === "failed" && (
										<p className="text-destructive text-xs leading-relaxed">
											{job.error || "A geração falhou."}
										</p>
									)}
									{job.status === "completed" && job.videoUrl && (
										<div className="flex flex-col gap-1.5">
											<video
												src={job.videoUrl}
												controls
												className="max-h-80 w-full rounded-lg border"
											>
												<track kind="captions" />
											</video>
											<div className="flex flex-wrap items-center gap-1.5">
												<Button
													size="sm"
													className="h-7 gap-1 text-xs"
													onClick={() =>
														job.videoUrl && video.addToTimeline(job.videoUrl)
													}
												>
													<HugeiconsIcon
														icon={Add01Icon}
														className="size-3.5"
													/>
													Adicionar à linha do tempo
												</Button>
												<Button
													asChild
													size="sm"
													variant="outline"
													className="h-7 gap-1 text-xs"
												>
													<a href={job.videoUrl} download>
														<HugeiconsIcon
															icon={Download04Icon}
															className="size-3.5"
														/>
														Baixar
													</a>
												</Button>
												<span className="text-muted-foreground text-[11px]">
													{jobModel?.name ?? job.provider}
												</span>
											</div>
										</div>
									)}
								</div>
							);
						})}
						{isPending && (
							<div className="flex flex-col gap-1.5">
								<p className="bg-primary text-primary-foreground ml-auto max-w-[85%] rounded-lg px-3 py-1.5 text-xs">
									{sentPrompt}
								</p>
								{status === "generating" ? (
									<p className="text-muted-foreground flex items-center gap-2 text-xs">
										<Spinner className="size-3" />
										Enviando o pedido…
									</p>
								) : (
									<p className="text-destructive text-xs leading-relaxed">
										{error || "Não foi possível gerar o vídeo."}
									</p>
								)}
							</div>
						)}
					</div>
				)}
			</div>

			<div className="bg-background shrink-0 border-t px-2 py-2">
				{needsKey && providerConfig && (
					<p className="mb-1.5 rounded-md bg-yellow-500/10 px-2.5 py-1.5 text-xs leading-relaxed text-yellow-600 dark:text-yellow-500">
						{model?.name} precisa da chave do {providerConfig.label}. Adicione
						em Config. → Chaves de API (
						<a
							href={providerConfig.signupUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="underline"
						>
							obter chave
						</a>
						) ou escolha outro modelo nas configurações.
					</p>
				)}

				{toConfirm && model && (
					<div className="mb-1.5 flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5">
						<p className="min-w-0 flex-1 text-xs leading-relaxed">
							Este clipe é cobrado pelo {getProviderLabel(model.provider)}:{" "}
							{price ?? formatVideoCostPerSecond(model)} por {duration} s.
						</p>
						<Button
							size="sm"
							variant="outline"
							className="h-7 text-xs"
							onClick={() => setToConfirm(null)}
						>
							Cancelar
						</Button>
						<Button
							size="sm"
							className="h-7 text-xs"
							onClick={() => start(toConfirm)}
						>
							Gerar
						</Button>
					</div>
				)}

				<div className="flex items-end gap-1.5">
					<Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
						<PopoverTrigger asChild>
							<Button
								size="icon"
								variant="ghost"
								className="size-[36px] shrink-0"
								title="Configurações do vídeo"
								aria-label="Configurações do vídeo"
								data-ui-target="ai/video-settings"
							>
								<HugeiconsIcon
									icon={SlidersHorizontalIcon}
									className="size-4"
								/>
							</Button>
						</PopoverTrigger>
						<PopoverContent
							side="top"
							align="start"
							className="flex max-h-[min(34rem,80vh)] w-[26rem] max-w-[calc(100vw-1rem)] flex-col gap-4 overflow-y-auto p-3"
						>
							<Setting label="Tipo">
								<Segments
									options={MODES}
									value={genMode}
									onChange={pickMode}
									className="w-full"
								/>
							</Setting>

							{genMode === "image-to-video" && (
								<Setting label="Imagem de origem (endereço)">
									<input
										type="url"
										value={imageUrl}
										onChange={(event) => video.setImageUrl(event.target.value)}
										placeholder="https://..."
										aria-label="Endereço da imagem de origem"
										className="placeholder:text-muted-foreground/50 h-8 w-full rounded-md border bg-transparent px-2.5 text-xs outline-none focus:ring-1 focus:ring-ring"
									/>
								</Setting>
							)}

							<Setting label="Modelo">
								<div className="flex max-h-56 flex-col overflow-y-auto rounded-md border p-1">
									{models.map((entry) => (
										<button
											key={entry.id}
											type="button"
											aria-pressed={entry.id === selectedModel}
											onClick={() => pickModel(entry)}
											className={cn(
												"hover:bg-accent flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left",
												entry.id === selectedModel && "bg-accent",
											)}
										>
											<span className="min-w-0 flex-1">
												<span className="flex items-center gap-1.5 text-sm">
													<span className="truncate">{entry.name}</span>
													<ModelOriginBadge origin={originOf(entry)} />
													{entry.id === selectedModel && (
														<HugeiconsIcon
															icon={Tick01Icon}
															className="size-3.5 shrink-0"
														/>
													)}
												</span>
												<span className="text-muted-foreground block text-xs leading-snug">
													{entry.description}
												</span>
											</span>
											<span className="text-muted-foreground mt-0.5 shrink-0 text-xs">
												{formatVideoCostPerSecond(entry)}
											</span>
										</button>
									))}
								</div>
								<p className="text-muted-foreground mt-1 text-[11px]">
									Preços dos provedores conferidos em 19/10/2026; podem mudar.
								</p>
							</Setting>

							<Setting label="Proporção">
								<Segments
									options={VIDEO_ASPECT_RATIOS.filter(
										(ratio) => !model || model.aspectRatios.includes(ratio.id),
									).map((ratio) => ({ id: ratio.id, label: ratio.id }))}
									value={selectedAspectRatio}
									onChange={video.setSelectedAspectRatio}
								/>
							</Setting>

							<Setting label={`Duração: ${duration} s`}>
								<Slider
									value={[duration]}
									onValueChange={([value]) => video.setDuration(value)}
									min={1}
									max={model?.maxDuration || 15}
									step={1}
									aria-label="Duração em segundos"
								/>
							</Setting>
						</PopoverContent>
					</Popover>

					<textarea
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								send();
							}
						}}
						placeholder="Descreva seu vídeo..."
						aria-label="Descrição do vídeo"
						rows={1}
						className="placeholder:text-muted-foreground/50 max-h-[100px] min-h-[36px] flex-1 resize-none rounded-md border bg-transparent px-2.5 py-2 text-xs outline-none focus:ring-1 focus:ring-ring"
						style={{ fieldSizing: "content" } as React.CSSProperties}
					/>
					<Button
						size="icon"
						variant={canSend ? "default" : "secondary"}
						className="size-[36px] shrink-0"
						aria-label="Gerar vídeo"
						onClick={send}
						disabled={!canSend}
					>
						{isBusy ? (
							<Spinner className="size-3.5" />
						) : (
							<HugeiconsIcon icon={SentIcon} className="size-3.5" />
						)}
					</Button>
				</div>

				{/* What a click on send will use, without opening the settings */}
				{model && (
					<button
						type="button"
						onClick={() => setIsSettingsOpen(true)}
						className="text-muted-foreground hover:text-foreground mt-1.5 flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded-sm text-left text-[11px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
					>
						<span className="truncate">{model.name}</span>
						<ModelOriginBadge origin={originOf(model)} />
						<span>
							· {selectedAspectRatio} · {duration} s{price ? ` · ${price}` : ""}
						</span>
					</button>
				)}
			</div>
		</>
	);
}

function Setting({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-medium">{label}</span>
			{children}
		</div>
	);
}

function Segments<T extends string>({
	options,
	value,
	onChange,
	className,
}: {
	options: { id: T; label: string }[];
	value: string;
	onChange: (id: T) => void;
	className?: string;
}) {
	return (
		<div className={cn("bg-accent/60 flex w-fit rounded-md p-0.5", className)}>
			{options.map((option) => (
				<button
					key={option.id}
					type="button"
					aria-pressed={value === option.id}
					onClick={() => onChange(option.id)}
					className={cn(
						"text-muted-foreground hover:text-foreground flex-1 rounded-sm px-2.5 py-1 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
						value === option.id && "bg-background text-foreground shadow-sm",
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}
