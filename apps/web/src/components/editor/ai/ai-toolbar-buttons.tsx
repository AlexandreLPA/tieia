"use client";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	AiMicIcon,
	SparklesIcon,
	TextIcon,
	Image01Icon,
	Upload04Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

// ----- Types -----

interface AIToolbarButtonsProps {
	onTranscribe?: () => void;
	onGenerateImage?: () => void;
	onGenerateVoiceover?: () => void;
	onGenerateInfographic?: () => void;
	onRemoveBackground?: () => void;
	onAddSubtitles?: () => void;
	onCleanAudio?: () => void;
	onSetupClick?: () => void;
	isTranscribing?: boolean;
	isGenerating?: boolean;
	isConnected?: boolean;
	className?: string;
}

// ----- Component -----

export function AIToolbarButtons({
	onTranscribe,
	onGenerateImage,
	onGenerateVoiceover,
	onGenerateInfographic,
	onRemoveBackground,
	onAddSubtitles,
	onCleanAudio,
	onSetupClick,
	isTranscribing = false,
	isGenerating = false,
	isConnected = false,
	className,
}: AIToolbarButtonsProps) {
	const isDisabled = !isConnected;
	const disabledReason = isDisabled
		? "O backend de IA não está conectado. Clique para configurar."
		: undefined;

	const handleDisabledClick = () => {
		if (isDisabled && onSetupClick) {
			onSetupClick();
		}
	};

	return (
		<div className={cn("flex items-center gap-1", className)}>
			{/* Transcribe button */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						onClick={isDisabled ? handleDisabledClick : onTranscribe}
						disabled={isTranscribing}
						aria-label="Transcrever áudio"
						className={cn(isDisabled && "opacity-50")}
					>
						<HugeiconsIcon
							icon={AiMicIcon}
							className={cn(
								"size-4",
								isTranscribing && "animate-pulse",
							)}
						/>
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					{disabledReason ?? "Transcrever"}
				</TooltipContent>
			</Tooltip>

			{/* AI Generate dropdown */}
			{isDisabled ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={handleDisabledClick}
							className="opacity-50"
							aria-label="Gerar com IA"
						>
							<HugeiconsIcon
								icon={SparklesIcon}
								className="size-4"
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>{disabledReason}</TooltipContent>
				</Tooltip>
			) : (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							disabled={isGenerating}
							aria-label="Gerar com IA"
							title="Gerar com IA"
						>
							<HugeiconsIcon
								icon={SparklesIcon}
								className={cn(
									"size-4",
									isGenerating && "animate-pulse",
								)}
							/>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-48">
						<DropdownMenuItem
							onClick={onGenerateImage}
							icon={<HugeiconsIcon icon={Image01Icon} />}
						>
							Imagem
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={onGenerateVoiceover}
							icon={<HugeiconsIcon icon={AiMicIcon} />}
						>
							Locução
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={onGenerateInfographic}
							icon={<HugeiconsIcon icon={TextIcon} />}
						>
							Infográfico
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={onRemoveBackground}
							icon={<HugeiconsIcon icon={Upload04Icon} />}
						>
							Remover fundo
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			{/* Subtitles button */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						onClick={isDisabled ? handleDisabledClick : onAddSubtitles}
						aria-label="Adicionar legendas"
						className={cn(isDisabled && "opacity-50")}
					>
						<HugeiconsIcon icon={TextIcon} className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					{disabledReason ?? "Legendas"}
				</TooltipContent>
			</Tooltip>

			{/* Clean Audio button */}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						onClick={isDisabled ? handleDisabledClick : onCleanAudio}
						aria-label="Limpar áudio"
						className={cn(isDisabled && "opacity-50")}
					>
						<HugeiconsIcon icon={SparklesIcon} className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					{disabledReason ?? "Limpar áudio"}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
