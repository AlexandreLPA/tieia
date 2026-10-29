"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Delete02Icon,
	MoreHorizontalIcon,
	PlayIcon,
	PlusSignIcon,
	StopIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { aiClient } from "@/lib/ai-client";
import { voiceLabel } from "@/lib/voiceover/voice-preferences";
import type { ChatterboxSavedVoice } from "@/types/ai";
import { cn } from "@/utils/ui";

/**
 * "Minhas vozes": the cloned voices as cards to pick from, with a card to
 * clone a new one. Like the voice pickers of CapCut and ElevenLabs, cloning is
 * always one click away, but picking a voice is what the panel is for.
 */
export function VoiceLibrary({
	voices,
	loading,
	unavailable,
	selected,
	onSelect,
	onClone,
	onDeleted,
}: {
	voices: ChatterboxSavedVoice[];
	loading: boolean;
	/** The voice service is off: cloning and the list wait for it */
	unavailable: string | null;
	selected: string | null;
	onSelect: (name: string) => void;
	onClone: () => void;
	onDeleted: (name: string) => void;
}) {
	const [playing, setPlaying] = useState<string | null>(null);
	const [loadingSample, setLoadingSample] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
	// The invitation to clone the first voice waits until the list says there is none
	const empty = !loading && voices.length === 0;
	const playerRef = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);

	const stopSample = () => {
		if (!playerRef.current) return;
		playerRef.current.audio.pause();
		URL.revokeObjectURL(playerRef.current.url);
		playerRef.current = null;
		setPlaying(null);
	};
	// Leaving the panel stops a sample that is still playing
	useEffect(
		() => () => {
			playerRef.current?.audio.pause();
			if (playerRef.current) URL.revokeObjectURL(playerRef.current.url);
		},
		[],
	);

	const toggleSample = async (name: string) => {
		const wasPlaying = playing === name;
		stopSample();
		if (wasPlaying) return;
		setLoadingSample(name);
		try {
			const url = URL.createObjectURL(await aiClient.getChatterboxVoiceAudio(name));
			const audio = new Audio(url);
			audio.addEventListener("ended", stopSample);
			playerRef.current = { audio, url };
			setPlaying(name);
			await audio.play();
		} catch {
			toast.error("Não deu para tocar a gravação desta voz");
		} finally {
			setLoadingSample(null);
		}
	};

	const handleDelete = async (name: string) => {
		if (playing === name) stopSample();
		try {
			await aiClient.deleteChatterboxVoice(name);
			onDeleted(name);
			toast.success(`Voz "${voiceLabel(name)}" excluída`);
		} catch (error) {
			toast.error("Não foi possível excluir a voz", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<p className="text-xs font-medium">Minhas vozes</p>
				{loading && <Spinner className="size-3" />}
			</div>

			{unavailable ? (
				<div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-2.5 py-2">
					<p className="text-[11px] leading-relaxed text-yellow-600 dark:text-yellow-400">
						{unavailable}
					</p>
				</div>
			) : (
				<div className="grid grid-cols-2 gap-1.5">
					<button
						type="button"
						data-ui-target="voice/clone"
						onClick={onClone}
						className={cn(
							"flex min-h-14 flex-col items-center justify-center gap-1 rounded-md border border-dashed px-2 py-2",
							"text-muted-foreground transition-colors hover:border-primary hover:text-foreground",
							empty && "col-span-2 border-primary/60 text-foreground",
						)}
					>
						<HugeiconsIcon icon={PlusSignIcon} className="size-4" />
						<span className="text-[11px] font-medium">Clonar voz</span>
						{empty && (
							<span className="text-[10px] text-muted-foreground">
								Grave 15 s e narre seus vídeos com a sua voz
							</span>
						)}
					</button>

					{voices.map((voice) => {
						const isSelected = selected === voice.name;
						return (
							<div
								key={voice.name}
								className={cn(
									"group relative flex min-h-14 flex-col justify-between gap-1 rounded-md border px-2 py-1.5 transition-colors",
									isSelected ? "border-primary bg-primary/5" : "hover:bg-accent/50",
								)}
							>
								<button
									type="button"
									className="absolute inset-0 rounded-md"
									aria-label={`Usar a voz ${voiceLabel(voice.name)}`}
									aria-pressed={isSelected}
									onClick={() => onSelect(voice.name)}
								/>
								<div className="flex items-start justify-between gap-1">
									<span className="truncate text-[11px] font-medium">{voiceLabel(voice.name)}</span>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<button
												type="button"
												aria-label="Mais opções"
												className="relative z-10 -mr-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
											>
												<HugeiconsIcon icon={MoreHorizontalIcon} className="size-3.5" />
											</button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												variant="destructive"
												onClick={() => setConfirmDelete(voice.name)}
											>
												<HugeiconsIcon icon={Delete02Icon} />
												Excluir voz
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
								<div className="flex items-center justify-between gap-1">
									<button
										type="button"
										className="relative z-10 flex items-center gap-1 text-[10px] text-primary hover:underline"
										onClick={() => toggleSample(voice.name)}
									>
										{loadingSample === voice.name ? (
											<Spinner className="size-3" />
										) : (
											<HugeiconsIcon icon={playing === voice.name ? StopIcon : PlayIcon} className="size-3" />
										)}
										{playing === voice.name ? "Parar" : "Gravação"}
									</button>
									<span className="text-[10px] tabular-nums text-muted-foreground">
										{Math.round(voice.duration)} s
									</span>
								</div>
							</div>
						);
					})}
				</div>
			)}

			<AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Excluir a voz "{confirmDelete && voiceLabel(confirmDelete)}"?</AlertDialogTitle>
						<AlertDialogDescription>
							A gravação usada para clonar é apagada deste computador. As narrações que já estão nos
							seus projetos continuam lá.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (confirmDelete) void handleDelete(confirmDelete);
								setConfirmDelete(null);
							}}
						>
							Excluir
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
