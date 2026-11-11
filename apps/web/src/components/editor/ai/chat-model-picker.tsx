"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	ArrowDown01Icon,
	BrainIcon,
	CloudIcon,
	ComputerIcon,
	Search01Icon,
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
import { cloudModelSummary, shortModelName } from "@/lib/ai-model-name";
import { notifyLlmChanged, onLlmChanged } from "@/lib/llm-change";
import { cn } from "@/utils/ui";
import { ModelOriginBadge } from "./model-origin-badge";
import {
	MODEL_LIST_CLASS,
	MODEL_ROW_CLASS,
	SETTINGS_PANEL_CLASS,
	Segments,
	Setting,
	SUMMARY_LINE_CLASS,
} from "./model-settings-ui";
import { OpenRouterKeyForm } from "./openrouter-key-form";

type Provider = "cloud" | "local";

interface ModelOption {
	provider: Provider;
	id: string;
	name: string;
	/** One line under the name: what the model offers */
	detail: string;
	/** Reasoning efforts the model lets the user pick; empty when it has no choice */
	efforts: string[];
}

interface PickerState {
	cloud: ModelOption[];
	local: ModelOption[];
	/** False without an OpenRouter key: nothing is asked of the cloud then */
	cloudConfigured: boolean;
	/** False when the key is set but the OpenRouter catalog could not be read */
	catalogAvailable: boolean;
	active: { provider: Provider; id: string };
	effort: string;
	/** Set while the cloud model fails and a local one answers in its place */
	issue: { message: string; fallback: string } | null;
}

const PROVIDERS: {
	id: Provider;
	label: string;
	caption: string;
	icon: typeof CloudIcon;
}[] = [
	{
		id: "cloud",
		label: "Nuvem",
		caption: "OpenRouter · modelos gratuitos",
		icon: CloudIcon,
	},
	{
		id: "local",
		label: "Neste PC",
		caption: "Ollama · roda na sua máquina",
		icon: ComputerIcon,
	},
];

// The three levels the picker offers, of those a model supports
const EFFORTS = [
	{ id: "low", label: "Baixo" },
	{ id: "medium", label: "Médio" },
	{ id: "high", label: "Alto" },
];

/** 8988124069 → "8,4 GB" */
function sizeLabel(bytes: number): string {
	return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}

function localDetail(model: {
	size: number;
	details?: Record<string, unknown>;
}): string {
	const parts: string[] = [];
	const parameters = model.details?.parameter_size;
	if (typeof parameters === "string" && parameters) {
		parts.push(`${parameters} de parâmetros`);
	}
	if (model.size > 0) parts.push(sizeLabel(model.size));
	return parts.join(" · ") || "instalado";
}

/**
 * The model that answers the chat, picked where the question is typed. A rail
 * switches between the free cloud models (OpenRouter) and the ones installed
 * on this PC (Ollama); models that let the caller choose how long they think
 * get the effort control at the bottom.
 */
export function ChatModelPicker({
	isPanelOpen = true,
	side = "top",
	className,
}: {
	/** For a chat that hides: the list is read again each time it opens */
	isPanelOpen?: boolean;
	/** Where the list opens, relative to the button */
	side?: "top" | "bottom";
	className?: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [state, setState] = useState<PickerState | null>(null);
	const [provider, setProvider] = useState<Provider>("cloud");
	const [query, setQuery] = useState("");
	const [switching, setSwitching] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const status = await aiClient.llmStatus();
			if (!status.available) {
				setState(null);
				return;
			}
			const local: ModelOption[] = status.models.map((model) => ({
				provider: "local",
				id: model.name,
				name: model.name,
				detail: localDetail(model),
				efforts: [],
			}));
			let cloud: ModelOption[] = [];
			let cloudActive = status.openrouter_model;
			let effort = "low";
			let catalogAvailable = false;
			if (status.openrouter_configured) {
				try {
					const catalog = await aiClient.listCloudModels();
					cloud = catalog.models.map((model) => ({
						provider: "cloud",
						id: model.id,
						name: model.name,
						// The badge beside the name already says it is free
						detail: cloudModelSummary(model).replace(", grátis", ""),
						efforts: model.efforts ?? [],
					}));
					cloudActive = catalog.active || cloudActive;
					effort = catalog.effort ?? effort;
					catalogAvailable = catalog.catalogAvailable;
				} catch {
					// The catalog is optional: the active model is still listed below
				}
				if (cloudActive && !cloud.some((model) => model.id === cloudActive)) {
					cloud.unshift({
						provider: "cloud",
						id: cloudActive,
						name: shortModelName(cloudActive),
						detail: "modelo em uso",
						efforts: [],
					});
				}
			}
			const isCloud = status.active_backend === "openrouter";
			const failing = status.llm?.cloudIssue;
			const served = status.llm?.served;
			setState({
				cloud,
				local,
				cloudConfigured: status.openrouter_configured,
				catalogAvailable,
				active: isCloud
					? { provider: "cloud", id: cloudActive }
					: { provider: "local", id: status.default_model },
				effort,
				issue: failing
					? {
							message: `${shortModelName(failing.model)} indisponível: ${failing.message}`,
							fallback: served && !served.cloud ? served.model : "modelo local",
						}
					: null,
			});
		} catch {
			setState(null);
		}
	}, []);

	// Also picks the backend up when it came online after the editor loaded
	useEffect(() => {
		if (isPanelOpen) load();
	}, [isPanelOpen, load]);

	// Another picker or "Gerenciar serviços de IA" changed the model
	useEffect(() => onLlmChanged(load), [load]);

	const activeKey = state ? `${state.active.provider}:${state.active.id}` : "";

	const select = useCallback(
		async (option: ModelOption) => {
			const key = `${option.provider}:${option.id}`;
			if (!state || key === activeKey || switching) return;
			setSwitching(key);
			try {
				if (option.provider === "cloud") {
					await aiClient.setCloudModel(option.id);
				} else {
					if (state.active.provider === "cloud") {
						await aiClient.setLocalBackend();
					}
					await aiClient.setLLMModel(option.id);
				}
				setState(
					(previous) =>
						previous && {
							...previous,
							active: { provider: option.provider, id: option.id },
							issue: null,
						},
				);
				setIsOpen(false);
				setQuery("");
				notifyLlmChanged();
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Falha ao trocar o modelo",
				);
			} finally {
				setSwitching(null);
			}
		},
		[state, activeKey, switching],
	);

	const selectEffort = useCallback(
		async (effort: string) => {
			if (!state || effort === state.effort) return;
			const previous = state.effort;
			setState((current) => current && { ...current, effort });
			try {
				await aiClient.setReasoningEffort(effort);
			} catch (error) {
				setState((current) => current && { ...current, effort: previous });
				toast.error(
					error instanceof Error ? error.message : "Falha ao salvar o esforço",
				);
			}
		},
		[state],
	);

	// With a search, both providers answer; without one, the rail picks
	const groups = useMemo(() => {
		if (!state) return [];
		const needle = query.trim().toLowerCase();
		if (!needle) {
			return [{ provider, options: state[provider] }];
		}
		const matches = (option: ModelOption) =>
			option.name.toLowerCase().includes(needle) ||
			option.id.toLowerCase().includes(needle);
		return PROVIDERS.map(({ id }) => ({
			provider: id,
			options: state[id].filter(matches),
		})).filter((group) => group.options.length > 0);
	}, [state, provider, query]);

	if (!state) return null;

	const activeOption = state[state.active.provider].find(
		(option) => option.id === state.active.id,
	);
	const efforts = EFFORTS.filter((effort) =>
		activeOption?.efforts.includes(effort.id),
	);
	const isSearching = query.trim().length > 0;
	const needsKey = provider === "cloud" && !state.cloudConfigured;
	const activeOrigin = (option: ModelOption) =>
		option.provider === "local"
			? ("local" as const)
			: option.id.endsWith(":free")
				? ("cloud-free" as const)
				: ("cloud-paid" as const);
	const effortLabel = EFFORTS.find(
		(effort) => effort.id === state.effort,
	)?.label;
	const triggerLabel = state.issue
		? `${state.issue.fallback} (reserva)`
		: activeOption?.name ||
			shortModelName(state.active.id) ||
			"Escolher modelo";

	return (
		<Popover
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (open) {
					setProvider(state.active.provider);
					load();
				} else {
					setQuery("");
				}
			}}
		>
			{/* The summary line under the message field, as in Tiê Image and Tiê Video */}
			<PopoverTrigger asChild>
				<button
					type="button"
					data-ui-target="ai/chat-model"
					aria-label={`Modelo do chat: ${triggerLabel}`}
					title={state.issue?.message}
					className={cn(
						SUMMARY_LINE_CLASS,
						state.issue && "text-yellow-500 hover:text-yellow-500",
						className,
					)}
				>
					<HugeiconsIcon
						icon={
							state.active.provider === "cloud" && !state.issue
								? CloudIcon
								: ComputerIcon
						}
						className="size-3.5 shrink-0"
					/>
					<span className="truncate">{triggerLabel}</span>
					{activeOption && !state.issue && (
						<ModelOriginBadge origin={activeOrigin(activeOption)} />
					)}
					{efforts.length > 1 && effortLabel && (
						<span>· raciocínio {effortLabel.toLowerCase()}</span>
					)}
					<HugeiconsIcon icon={ArrowDown01Icon} className="size-3 shrink-0" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				side={side}
				align="start"
				className={SETTINGS_PANEL_CLASS}
			>
				{state.issue && (
					<p className="rounded-md bg-yellow-500/10 px-2.5 py-2 text-xs leading-relaxed text-yellow-500">
						{state.issue.message}. Quem responde agora é {state.issue.fallback}.
					</p>
				)}

				<Setting label="Onde roda">
					<Segments
						options={PROVIDERS.map((item) => ({
							id: item.id,
							label: item.label,
						}))}
						value={isSearching ? "" : provider}
						onChange={(next) => {
							setProvider(next);
							setQuery("");
						}}
					/>
				</Setting>

				<Setting label="Modelo">
					{needsKey && !isSearching ? (
						<div className="flex flex-col gap-3 rounded-md border p-2.5">
							<p className="text-muted-foreground text-xs leading-relaxed">
								Cole a sua chave da OpenRouter para usar os modelos gratuitos da
								nuvem. Crie uma em{" "}
								<a
									href="https://openrouter.ai/keys"
									target="_blank"
									rel="noopener noreferrer"
									className="text-foreground underline"
								>
									openrouter.ai/keys
								</a>
								. Ela fica salva só neste computador.
							</p>
							<OpenRouterKeyForm
								onSaved={() => {
									load();
									notifyLlmChanged();
								}}
							/>
						</div>
					) : (
						<>
							<div className="relative">
								<HugeiconsIcon
									icon={Search01Icon}
									className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
								/>
								<input
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Buscar modelos"
									aria-label="Buscar modelos"
									className="placeholder:text-muted-foreground/60 h-8 w-full rounded-md border bg-transparent pr-2.5 pl-8 text-xs outline-none focus:ring-1 focus:ring-ring"
								/>
							</div>
							<div className={MODEL_LIST_CLASS}>
								{groups.map((group) => {
									const info = PROVIDERS.find(
										(item) => item.id === group.provider,
									);
									return (
										<div key={group.provider}>
											<p className="text-muted-foreground px-2 pt-1 pb-1 text-[11px]">
												{isSearching
													? `${info?.label} · ${info?.caption}`
													: info?.caption}
											</p>
											{group.options.map((option) => {
												const key = `${option.provider}:${option.id}`;
												const isActive = key === activeKey;
												return (
													<button
														key={key}
														type="button"
														aria-pressed={isActive}
														disabled={switching !== null}
														onClick={() => select(option)}
														className={cn(
															MODEL_ROW_CLASS,
															isActive && "bg-accent",
														)}
													>
														<span className="min-w-0 flex-1">
															<span className="flex items-center gap-1.5 text-sm">
																<span className="truncate">{option.name}</span>
																<ModelOriginBadge
																	origin={activeOrigin(option)}
																/>
																{switching === key ? (
																	<Spinner className="size-3 shrink-0" />
																) : (
																	isActive && (
																		<HugeiconsIcon
																			icon={Tick01Icon}
																			className="size-3.5 shrink-0"
																		/>
																	)
																)}
															</span>
															<span className="text-muted-foreground block text-xs leading-snug">
																{option.detail}
															</span>
														</span>
														{option.efforts.length > 0 && (
															<span
																title="Esforço de raciocínio ajustável"
																className="text-muted-foreground mt-0.5 shrink-0"
															>
																<HugeiconsIcon
																	icon={BrainIcon}
																	className="size-3.5"
																/>
															</span>
														)}
													</button>
												);
											})}
										</div>
									);
								})}
								{groups.every((group) => group.options.length === 0) && (
									<p className="text-muted-foreground px-2 py-3 text-xs leading-relaxed">
										{isSearching
											? "Nenhum modelo com esse nome."
											: provider === "local"
												? "Nenhum modelo instalado neste PC. Baixe um em Gerenciar serviços de IA."
												: "A lista da OpenRouter não pôde ser lida agora."}
									</p>
								)}
							</div>
							{provider === "cloud" &&
								!isSearching &&
								state.cloudConfigured &&
								!state.catalogAvailable &&
								state.cloud.length > 0 && (
									<p className="text-muted-foreground text-[11px] leading-relaxed">
										A lista completa da OpenRouter não pôde ser lida agora.
									</p>
								)}
						</>
					)}
				</Setting>

				{efforts.length > 1 && (
					<Setting label="Raciocínio">
						<Segments
							options={efforts}
							value={state.effort}
							onChange={selectEffort}
						/>
						<p className="text-muted-foreground text-[11px] leading-relaxed">
							Mais raciocínio dá respostas mais pensadas, e mais demoradas.
						</p>
					</Setting>
				)}
			</PopoverContent>
		</Popover>
	);
}
