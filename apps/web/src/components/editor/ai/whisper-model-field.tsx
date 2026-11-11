"use client";

import { useEffect, useState } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { formatSize, useWhisperModels } from "@/lib/local-models";
import { LocalModelList } from "./local-model-list";
import { SETTINGS_PANEL_CLASS } from "./model-settings-ui";

// The service describes its models in English
const DESCRIPTIONS: Record<string, string> = {
	tiny: "O mais rápido, com a menor precisão",
	base: "Rápido, com precisão razoável",
	small: "Boa precisão, ainda rápido sem placa de vídeo",
	medium: "Alta precisão, mais lento",
	"large-v3": "A maior precisão; rápido com placa de vídeo",
};

/**
 * The transcription model, in the Captions panel beside the button that
 * transcribes: where the choice between speed and accuracy makes sense.
 */
export function WhisperModelField() {
	const whisperModels = useWhisperModels();
	const { models, selected, error, refresh } = whisperModels;
	const [open, setOpen] = useState(false);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const model = models.find((entry) => entry.name === selected);

	return (
		<div className="flex flex-col gap-2">
			<Label className="text-xs">Modelo</Label>
			<Popover
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (next) refresh();
				}}
			>
				<PopoverTrigger asChild>
					<button
						type="button"
						data-ui-target="captions/whisper-model"
						className="border-input hover:bg-accent flex h-9 w-full items-center gap-2 rounded-md border px-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
					>
						<span className="min-w-0 flex-1 truncate">
							{model ? model.name : error ? "Serviço desligado" : "Carregando..."}
						</span>
						{model && (
							<span className="text-muted-foreground shrink-0 text-[11px]">
								{model.downloaded
									? "baixado"
									: `baixa ${formatSize(model.size_mb)}`}
							</span>
						)}
						<HugeiconsIcon
							icon={ArrowDown01Icon}
							className="text-muted-foreground size-4 shrink-0"
						/>
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className={SETTINGS_PANEL_CLASS}>
					<LocalModelList source={whisperModels} descriptions={DESCRIPTIONS} />
				</PopoverContent>
			</Popover>
			<p className="text-[10px] text-muted-foreground">
				{model && !model.downloaded
					? `O primeiro uso baixa ${formatSize(model.size_mb)} para este PC.`
					: "Modelos maiores erram menos e levam mais tempo."}
			</p>
		</div>
	);
}
