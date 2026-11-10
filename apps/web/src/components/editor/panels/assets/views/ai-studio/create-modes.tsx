"use client";

import {
	Add01Icon,
	Cancel01Icon,
	Image01Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/ui";
import type { StudioMode } from "./workflows";

/** What the Estúdio creates besides chat answers, each with a name of its own. */
export const CREATE_MODES = [
	{
		mode: "tie-image",
		action: "Criar imagem",
		name: "Tiê Image",
		icon: Image01Icon,
	},
	{
		mode: "tie-video",
		action: "Criar vídeo",
		name: "Tiê Video",
		icon: Video01Icon,
	},
] as const satisfies readonly {
	mode: StudioMode;
	action: string;
	name: string;
	icon: typeof Image01Icon;
}[];

// The Estúdio's other tools, also reachable from its tabs
const TOOLS: { mode: StudioMode; label: string }[] = [
	{ mode: "video-bg", label: "Remover fundo" },
	{ mode: "reframe", label: "Reenquadrar" },
	{ mode: "youtube-reels", label: "Cortes do YouTube" },
	{ mode: "workflow", label: "Fluxos de trabalho" },
	{ mode: "ideas", label: "Ideias salvas" },
];

/** The "+" beside the message field: what else the Estúdio can make. */
export function CreateMenu({
	onSelect,
	disabled,
}: {
	onSelect: (mode: StudioMode) => void;
	disabled?: boolean;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="icon"
					variant="ghost"
					className="size-[36px] shrink-0"
					title="Criar imagem, vídeo e outras ferramentas"
					aria-label="Criar imagem, vídeo e outras ferramentas"
					data-ui-target="ai/create"
					disabled={disabled}
				>
					<HugeiconsIcon icon={Add01Icon} className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start" className="w-52">
				{CREATE_MODES.map((item) => (
					<DropdownMenuItem
						key={item.mode}
						onClick={() => onSelect(item.mode)}
						icon={<HugeiconsIcon icon={item.icon} className="size-4" />}
					>
						{item.action}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="text-muted-foreground text-[11px] font-normal">
					Ferramentas
				</DropdownMenuLabel>
				{TOOLS.map((tool) => (
					<DropdownMenuItem key={tool.mode} onClick={() => onSelect(tool.mode)}>
						{tool.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** The same two creations as buttons, shown while the chat is still empty. */
export function CreateShortcuts({
	onSelect,
}: {
	onSelect: (mode: StudioMode) => void;
}) {
	return (
		<div className="mb-1.5 flex flex-wrap gap-1.5">
			{CREATE_MODES.map((item) => (
				<button
					key={item.mode}
					type="button"
					onClick={() => onSelect(item.mode)}
					className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
				>
					<HugeiconsIcon icon={item.icon} className="size-3.5" />
					{item.action}
				</button>
			))}
		</div>
	);
}

/** Says which creation is open, and closes it back to the chat. */
export function ModeChip({
	mode,
	onExit,
	className,
}: {
	mode: (typeof CREATE_MODES)[number]["mode"];
	onExit: () => void;
	className?: string;
}) {
	const item = CREATE_MODES.find((entry) => entry.mode === mode);
	if (!item) return null;
	return (
		<span
			className={cn(
				"bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs font-medium",
				className,
			)}
		>
			<HugeiconsIcon icon={item.icon} className="size-3.5" />
			{item.name}
			<button
				type="button"
				onClick={onExit}
				aria-label={`Sair de ${item.name} e voltar ao chat`}
				title="Voltar ao chat"
				className="hover:bg-primary/20 flex size-4 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
			>
				<HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
			</button>
		</span>
	);
}
