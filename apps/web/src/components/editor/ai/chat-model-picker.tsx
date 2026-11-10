"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	ArrowDown01Icon,
	CloudIcon,
	ComputerIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { aiClient } from "@/lib/ai-client";
import { cn } from "@/utils/ui";

interface ModelOption {
	id: string;
	name: string;
	cloud: boolean;
}

interface PickerState {
	local: ModelOption[];
	cloud: ModelOption[];
	/** False without an OpenRouter key: nothing is asked of the cloud then */
	cloudConfigured: boolean;
	/** `cloud:<id>` or `local:<id>` */
	active: string;
}

const keyOf = (option: ModelOption) =>
	`${option.cloud ? "cloud" : "local"}:${option.id}`;

/** "nvidia/nemotron-3.5:free" → "nemotron-3.5" */
const shortName = (id: string) => id.replace(/^.*\//, "").replace(/:free$/, "");

/**
 * The model that answers the chat, picked where the question is typed:
 * the free cloud models (OpenRouter) and the local ones (Ollama) in one list.
 */
export function ChatModelPicker({
	isPanelOpen,
	className,
}: {
	/** The list is read again each time the chat opens */
	isPanelOpen: boolean;
	className?: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [state, setState] = useState<PickerState | null>(null);
	const [query, setQuery] = useState("");
	const [switching, setSwitching] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const status = await aiClient.llmStatus();
			const local = status.models.map((model) => ({
				id: model.name,
				name: model.name,
				cloud: false,
			}));
			const isCloud = status.active_backend === "openrouter";
			let cloud: ModelOption[] = [];
			let cloudActive = status.openrouter_model;
			if (status.openrouter_configured) {
				try {
					const catalog = await aiClient.listCloudModels();
					cloud = catalog.models.map((model) => ({
						id: model.id,
						name: model.name,
						cloud: true,
					}));
					cloudActive = catalog.active || cloudActive;
				} catch {
					// The catalog is optional: the active model is still listed below
				}
				if (cloudActive && !cloud.some((model) => model.id === cloudActive)) {
					cloud.unshift({
						id: cloudActive,
						name: shortName(cloudActive),
						cloud: true,
					});
				}
			}
			setState({
				local,
				cloud,
				cloudConfigured: status.openrouter_configured,
				active: isCloud
					? `cloud:${cloudActive}`
					: `local:${status.default_model}`,
			});
		} catch {
			setState(null);
		}
	}, []);

	// Also picks the backend up when it came online after the editor loaded
	useEffect(() => {
		if (isPanelOpen) load();
	}, [isPanelOpen, load]);

	// The model can also change in "Gerenciar serviços de IA"
	useEffect(() => {
		if (isOpen) load();
	}, [isOpen, load]);

	const select = useCallback(
		async (option: ModelOption) => {
			const key = keyOf(option);
			if (!state || key === state.active || switching) return;
			setSwitching(key);
			try {
				if (option.cloud) {
					await aiClient.setCloudModel(option.id);
				} else {
					if (state.active.startsWith("cloud:")) {
						await aiClient.setLocalBackend();
					}
					await aiClient.setLLMModel(option.id);
				}
				setState((prev) => prev && { ...prev, active: key });
				setIsOpen(false);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Falha ao trocar o modelo",
				);
			} finally {
				setSwitching(null);
			}
		},
		[state, switching],
	);

	const groups = useMemo(() => {
		if (!state) return [];
		const needle = query.trim().toLowerCase();
		const matches = (option: ModelOption) =>
			!needle ||
			option.name.toLowerCase().includes(needle) ||
			option.id.toLowerCase().includes(needle);
		return [
			{ label: "Nuvem · OpenRouter", options: state.cloud.filter(matches) },
			{ label: "Neste PC · Ollama", options: state.local.filter(matches) },
		].filter((group) => group.options.length > 0);
	}, [state, query]);

	if (!state) return null;

	const isCloudActive = state.active.startsWith("cloud:");
	const activeId = state.active.replace(/^(cloud|local):/, "");

	return (
		<Popover
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (!open) setQuery("");
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					data-ui-target="ai/chat-model"
					aria-label={`Modelo do chat: ${activeId}`}
					className={cn(
						"text-muted-foreground hover:text-foreground hover:bg-accent flex max-w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-[11px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
						className,
					)}
				>
					<HugeiconsIcon
						icon={isCloudActive ? CloudIcon : ComputerIcon}
						className="size-3.5 shrink-0"
					/>
					<span className="truncate">{shortName(activeId) || "Modelo"}</span>
					<HugeiconsIcon icon={ArrowDown01Icon} className="size-3 shrink-0" />
				</button>
			</PopoverTrigger>
			<PopoverContent side="top" align="start" className="w-72 p-0">
				<div className="border-b p-2">
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Buscar modelos"
						aria-label="Buscar modelos"
						className="bg-accent placeholder:text-muted-foreground h-8 w-full rounded-sm px-2.5 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div className="max-h-72 overflow-y-auto p-1">
					{groups.length === 0 && (
						<p className="text-muted-foreground px-2.5 py-3 text-xs">
							Nenhum modelo encontrado.
						</p>
					)}
					{groups.map((group) => (
						<div key={group.label}>
							<p className="text-muted-foreground px-2.5 pt-2 pb-1 text-[11px]">
								{group.label}
							</p>
							{group.options.map((option) => {
								const key = keyOf(option);
								const isActive = key === state.active;
								return (
									<button
										key={key}
										type="button"
										aria-pressed={isActive}
										disabled={switching !== null}
										onClick={() => select(option)}
										className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm disabled:opacity-60"
									>
										<span className="flex size-4 shrink-0 items-center justify-center">
											{switching === key ? (
												<Spinner className="size-3" />
											) : isActive ? (
												<HugeiconsIcon icon={Tick01Icon} className="size-4" />
											) : null}
										</span>
										<span className="min-w-0 flex-1 truncate">
											{option.name}
										</span>
										{option.cloud && (
											<span className="bg-accent text-muted-foreground shrink-0 rounded-sm px-1.5 py-0.5 text-[10px]">
												Grátis
											</span>
										)}
									</button>
								);
							})}
						</div>
					))}
					{!state.cloudConfigured && (
						<p className="text-muted-foreground border-t px-2.5 py-2 text-[11px] leading-relaxed">
							Para listar os modelos gratuitos da nuvem, adicione uma chave do
							OpenRouter em Gerenciar serviços de IA.
						</p>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
