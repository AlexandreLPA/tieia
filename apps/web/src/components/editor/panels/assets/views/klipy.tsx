"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useEditor } from "@/hooks/use-editor";
import { cn } from "@/utils/ui";
import {
	getKlipyKey,
	KLIPY_SIGNUP_URL,
	KLIPY_STICKER_PREFIX,
	type KlipyItem,
	type KlipyKind,
	klipyMediaUrl,
	klipyPreviewUrl,
	reportKlipyShare,
	searchKlipy,
	setKlipyKey,
} from "@/lib/klipy";
import { clearDragData, setDragData } from "@/lib/drag-data";
import { buildStickerElement } from "@/lib/timeline/element-utils";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";

const KINDS: { value: KlipyKind; label: string; hint: string }[] = [
	{ value: "stickers", label: "Stickers", hint: "sem fundo" },
	{ value: "gifs", label: "GIFs", hint: "com fundo" },
];

// Ideas that fit TikTok Shop edits. KLIPY's library is mostly tagged in
// English, so each Portuguese chip searches the English term
const SUGGESTIONS: { label: string; query: string }[] = [
	{ label: "seta para baixo", query: "arrow down" },
	{ label: "seta vermelha", query: "red arrow" },
	{ label: "dedo apontando", query: "pointing down" },
	{ label: "clique aqui", query: "click here" },
	{ label: "compre agora", query: "buy now" },
	{ label: "oferta", query: "sale" },
	{ label: "uau", query: "wow" },
	{ label: "fogo", query: "fire" },
];

const SEARCH_DEBOUNCE_MS = 450;
// Stickers are scaled to fit the frame first; this keeps them a sensible size
const STICKER_SCALE = 0.45;

function KeySetup({ onSaved }: { onSaved: () => void }) {
	const [value, setValue] = useState("");
	return (
		<div className="flex flex-col gap-3 rounded-md border p-3 text-xs">
			<p className="font-medium">Conecte a KLIPY para buscar GIFs e stickers</p>
			<ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
				<li>
					Crie uma conta grátis em{" "}
					<a
						href={KLIPY_SIGNUP_URL}
						target="_blank"
						rel="noreferrer"
						className="text-primary underline"
					>
						partner.klipy.com
					</a>
					.
				</li>
				<li>No painel, gere uma chave (API key) de teste.</li>
				<li>Cole a chave aqui. Ela fica salva só neste navegador.</li>
			</ol>
			<div className="flex gap-2">
				<Input
					value={value}
					onChange={(event) => setValue(event.target.value)}
					placeholder="Chave da KLIPY"
					aria-label="Chave da KLIPY"
					className="h-8 text-xs"
				/>
				<Button
					size="sm"
					disabled={!value.trim()}
					onClick={() => {
						setKlipyKey(value);
						onSaved();
					}}
				>
					Salvar
				</Button>
			</div>
		</div>
	);
}

/**
 * KLIPY search in its own tab (their terms ask for a dedicated section, the
 * "Search KLIPY" placeholder and results in the order they come).
 */
export function KlipyView() {
	const editor = useEditor();
	const [hasKey, setHasKey] = useState(() => Boolean(getKlipyKey()));
	const [kind, setKind] = useState<KlipyKind>("stickers");
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<KlipyItem[]>([]);
	const [page, setPage] = useState(1);
	const [hasNext, setHasNext] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const requestId = useRef(0);

	const load = useCallback(
		async ({ nextPage, append }: { nextPage: number; append: boolean }) => {
			const id = ++requestId.current;
			setLoading(true);
			setError(null);
			try {
				const result = await searchKlipy({ kind, query, page: nextPage });
				if (id !== requestId.current) return;
				setItems((previous) => (append ? [...previous, ...result.items] : result.items));
				setPage(result.page);
				setHasNext(result.hasNext);
			} catch (caught) {
				if (id !== requestId.current) return;
				setError(caught instanceof Error ? caught.message : "Falha ao buscar na KLIPY");
			} finally {
				if (id === requestId.current) setLoading(false);
			}
		},
		[kind, query],
	);

	useEffect(() => {
		if (!hasKey) return;
		const timer = setTimeout(() => void load({ nextPage: 1, append: false }), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [hasKey, load]);

	// The Kit TikTok Shop (or anything else) can open this tab mid-search
	const gifSearchRequest = useAssetsPanelStore((s) => s.gifSearchRequest);
	const clearGifSearchRequest = useAssetsPanelStore((s) => s.clearGifSearchRequest);
	useEffect(() => {
		if (gifSearchRequest === null) return;
		setKind("stickers");
		setQuery(gifSearchRequest);
		clearGifSearchRequest();
	}, [gifSearchRequest, clearGifSearchRequest]);

	const addItem = (item: KlipyItem) => {
		const url = klipyMediaUrl(item);
		if (!url) {
			toast.error("Esse item não tem um formato que o editor use");
			return;
		}
		// Only the KLIPY URL is kept; the media loads from KLIPY when drawn
		const element = buildStickerElement({
			stickerId: `${KLIPY_STICKER_PREFIX}:${url}`,
			name: item.title || "KLIPY",
			startTime: editor.playback.getCurrentTime(),
		});
		editor.timeline.insertElement({
			element: { ...element, transform: { ...element.transform, scale: STICKER_SCALE } },
			placement: { mode: "auto", trackType: "sticker" },
		});
		reportKlipyShare({ kind, slug: item.slug, query });
		toast.success("Adicionado no playhead");
	};

	const startDrag = (event: React.DragEvent, item: KlipyItem) => {
		const url = klipyMediaUrl(item);
		if (!url) {
			event.preventDefault();
			return;
		}
		setDragData({
			dataTransfer: event.dataTransfer,
			dragData: {
				id: String(item.id),
				type: "sticker",
				name: item.title || "KLIPY",
				stickerId: `${KLIPY_STICKER_PREFIX}:${url}`,
				scale: STICKER_SCALE,
			},
		});
		event.dataTransfer.effectAllowed = "copy";
	};

	return (
		<PanelView title="GIFs e Stickers">
			<div className="flex flex-col gap-3 pb-4">
				{!hasKey ? (
					<KeySetup onSaved={() => setHasKey(true)} />
				) : (
					<>
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search KLIPY"
							aria-label="Search KLIPY"
							showClearIcon
							onClear={() => setQuery("")}
							className="h-8 text-xs"
						/>
						<div className="flex gap-1">
							{KINDS.map((option) => (
								<Button
									key={option.value}
									size="sm"
									variant={kind === option.value ? "secondary" : "outline"}
									className={cn("h-7 flex-1 gap-1 text-xs", kind === option.value && "ring-1 ring-primary")}
									onClick={() => setKind(option.value)}
								>
									{option.label}
									<span className="text-[10px] font-normal text-muted-foreground">
										{option.hint}
									</span>
								</Button>
							))}
						</div>
						<div className="flex flex-wrap gap-1">
							{SUGGESTIONS.map((suggestion) => (
								<button
									key={suggestion.query}
									type="button"
									title={`Busca "${suggestion.query}"`}
									onClick={() => setQuery(suggestion.query)}
									className={cn(
										"rounded-full border px-2 py-0.5 text-[10px] hover:bg-accent",
										query === suggestion.query && "border-primary text-primary",
									)}
								>
									{suggestion.label}
								</button>
							))}
						</div>
						<p className="text-[10px] leading-snug text-muted-foreground">
							Clique para colocar no ponto do playhead ou arraste até a linha do
							tempo. Depois, arraste no preview para posicionar.
						</p>

						{error && (
							<p className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-400">
								{error}
							</p>
						)}

						<div className="grid grid-cols-3 gap-1.5">
							{items.map((item) => {
								const preview = klipyPreviewUrl(item);
								if (!preview) return null;
								return (
									<button
										key={`${item.id}-${item.slug}`}
										type="button"
										title={item.title ? `${item.title} (clique para adicionar)` : "Clique para adicionar"}
										draggable
										onDragStart={(event) => startDrag(event, item)}
										onDragEnd={() => clearDragData()}
										onClick={() => addItem(item)}
										className={cn(
											"group relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-md border p-1 hover:ring-1 hover:ring-primary",
											kind === "stickers"
												? "bg-[repeating-conic-gradient(#3a3a3a_0_25%,#2a2a2a_0_50%)] bg-[length:14px_14px]"
												: "bg-muted",
										)}
									>
										{/* biome-ignore lint/performance/noImgElement: KLIPY media must load from its own URL */}
										<img
											src={preview}
											alt={item.title}
											loading="lazy"
											draggable={false}
											className="max-h-full max-w-full object-contain"
										/>
										<span className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-sm bg-background text-foreground opacity-0 shadow transition-opacity group-hover:opacity-100">
											<Plus className="size-3.5" />
										</span>
									</button>
								);
							})}
						</div>

						{loading && (
							<div className="flex justify-center py-2">
								<Spinner />
							</div>
						)}
						{!loading && items.length === 0 && !error && (
							<p className="py-4 text-center text-xs text-muted-foreground">
								Nada encontrado. Tente em inglês, como "arrow" ou "sale".
							</p>
						)}
						{hasNext && !loading && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => void load({ nextPage: page + 1, append: true })}
							>
								Carregar mais
							</Button>
						)}

						<p className="text-[10px] leading-snug text-muted-foreground">
							Buscas em inglês trazem bem mais resultados. A chave de teste
							permite 100 buscas por hora.
						</p>
						<div className="flex items-center justify-between text-[10px] text-muted-foreground">
							<span>Powered by KLIPY</span>
							<button
								type="button"
								className="underline"
								onClick={() => {
									setKlipyKey(null);
									setHasKey(false);
									setItems([]);
								}}
							>
								Trocar chave
							</button>
						</div>
						<p className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2 text-[10px] leading-snug text-muted-foreground">
							Em anúncios, prefira setas, textos e elementos genéricos. Cenas de
							filmes, séries e personagens podem ter direitos autorais e levar à
							recusa do anúncio.
						</p>
					</>
				)}
			</div>
		</PanelView>
	);
}
