"use client";

import { useCallback, useRef, useState } from "react";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { PanelView } from "@/components/editor/panels/assets/views/base-view";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/hooks/use-editor";
import { DEFAULT_TEXT_ELEMENT } from "@/constants/text-constants";
import { buildTextElement } from "@/lib/timeline/element-utils";
import { toast } from "sonner";
import type { TextElement } from "@/types/timeline";

interface TextPreset {
	id: string;
	name: string;
	preview: string;
	config: Partial<Omit<TextElement, "type" | "id">>;
}

const TEXT_PRESETS: TextPreset[] = [
	{
		id: "cutout",
		name: "Recorte de jornal",
		preview: "OFERTA",
		config: {
			content: "OFERTA DO DIA",
			fontSize: 6,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#111111",
			letterStyle: "cutout",
		},
	},
	{
		id: "cutout-mono",
		name: "Recorte P&B",
		preview: "SÓ HOJE",
		config: {
			content: "SÓ HOJE",
			fontSize: 6,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#111111",
			letterStyle: "cutout-mono",
		},
	},
	{
		id: "highlighter",
		name: "Marca-texto",
		preview: "frete grátis",
		config: {
			content: "frete grátis",
			fontSize: 7,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#111111",
			background: {
				enabled: true,
				color: "#FFE600",
				cornerRadius: 12,
				paddingX: 14,
				paddingY: 6,
				offsetX: 0,
				offsetY: 0,
			},
		},
	},
	{
		id: "retro",
		name: "Retrô",
		preview: "RETRÔ",
		config: {
			content: "RETRÔ",
			fontSize: 10,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#FFD60A",
			stroke: { enabled: true, color: "#111111", width: 8 },
			shadow: { enabled: true, color: "#111111", blur: 0, offsetX: 9, offsetY: 9 },
		},
	},
	{
		id: "neon-pink",
		name: "Neon rosa",
		preview: "Neon",
		config: {
			content: "Neon",
			fontSize: 10,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#FFE3F1",
			shadow: { enabled: true, color: "#FF2E93", blur: 35, offsetX: 0, offsetY: 0 },
		},
	},
	{
		id: "bubble",
		name: "Balão",
		preview: "olha isso",
		config: {
			content: "olha isso 👀",
			fontSize: 6,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#111111",
			background: {
				enabled: true,
				color: "#FFFFFF",
				cornerRadius: 100,
				paddingX: 24,
				paddingY: 12,
				offsetX: 0,
				offsetY: 0,
			},
		},
	},
	{
		id: "red-band",
		name: "Tarja vermelha",
		preview: "ÚLTIMAS",
		config: {
			content: "ÚLTIMAS UNIDADES",
			fontSize: 6,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#FFFFFF",
			background: {
				enabled: true,
				color: "#E11D48",
				cornerRadius: 0,
				paddingX: 20,
				paddingY: 10,
				offsetX: 0,
				offsetY: 0,
			},
		},
	},
	{
		id: "gradient-sunset",
		name: "Gradiente pôr do sol",
		preview: "50% OFF",
		config: {
			content: "50% OFF",
			fontSize: 11,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#FFD60A",
			fillGradient: { from: "#FFD60A", to: "#FF4D6D" },
			stroke: { enabled: true, color: "#111111", width: 8 },
		},
	},
	{
		id: "gradient-gold",
		name: "Dourado",
		preview: "PREMIUM",
		config: {
			content: "PREMIUM",
			fontSize: 10,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#FFE9A8",
			fillGradient: { from: "#FFF3B0", to: "#B8860B" },
			shadow: { enabled: true, color: "#000000", blur: 12, offsetX: 0, offsetY: 5 },
		},
	},
	{
		id: "heading",
		name: "Título",
		preview: "Título",
		config: {
			content: "Título",
			fontSize: 24,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#FFFFFF",
		},
	},
	{
		id: "subheading",
		name: "Subtítulo",
		preview: "Subtítulo",
		config: {
			content: "Subtítulo",
			fontSize: 16,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#E2E8F0",
		},
	},
	{
		id: "body",
		name: "Texto do corpo",
		preview: "Texto do corpo",
		config: {
			content: "Texto do corpo",
			fontSize: 10,
			fontWeight: "normal",
			fontFamily: "Inter",
			color: "#FFFFFF",
		},
	},
	{
		id: "caption",
		name: "Legenda",
		preview: "Legenda",
		config: {
			content: "Legenda",
			fontSize: 6,
			fontWeight: "normal",
			fontFamily: "Inter",
			color: "#94A3B8",
		},
	},
	{
		id: "bold-impact",
		name: "Impacto em negrito",
		preview: "IMPACTO",
		config: {
			content: "IMPACTO",
			fontSize: 30,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#EF4444",
		},
	},
	{
		id: "outlined",
		name: "Branco com contorno",
		preview: "Contorno",
		config: {
			content: "Contorno",
			fontSize: 20,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#FFFFFF",
			stroke: { enabled: true, color: "#000000", width: 12 },
		},
	},
	{
		id: "outlined-yellow",
		name: "Amarelo com contorno",
		preview: "DESTAQUE",
		config: {
			content: "DESTAQUE",
			fontSize: 20,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#FACC15",
			stroke: { enabled: true, color: "#000000", width: 12 },
		},
	},
	{
		id: "shadow",
		name: "Com sombra",
		preview: "Sombra",
		config: {
			content: "Sombra",
			fontSize: 20,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#FFFFFF",
			shadow: {
				enabled: true,
				color: "#000000",
				blur: 15,
				offsetX: 0,
				offsetY: 6,
			},
		},
	},
	{
		id: "neon",
		name: "Neon",
		preview: "Neon",
		config: {
			content: "Neon",
			fontSize: 20,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#E0F7FF",
			shadow: {
				enabled: true,
				color: "#22D3EE",
				blur: 35,
				offsetX: 0,
				offsetY: 0,
			},
		},
	},
	{
		id: "label-badge",
		name: "Etiqueta / Selo",
		preview: "ETIQUETA",
		config: {
			content: "ETIQUETA",
			fontSize: 5,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#FFFFFF",
			background: {
				enabled: true,
				color: "#3B82F6",
				cornerRadius: 50,
				paddingX: 20,
				paddingY: 8,
				offsetX: 0,
				offsetY: 0,
			},
		},
	},
	{
		id: "lower-third",
		name: "Terço inferior",
		preview: "Nome | Cargo",
		config: {
			content: "Nome | Cargo",
			fontSize: 6,
			fontWeight: "bold",
			fontFamily: "Inter",
			color: "#FFFFFF",
			background: {
				enabled: true,
				color: "#000000",
				cornerRadius: 4,
				paddingX: 16,
				paddingY: 8,
				offsetX: 0,
				offsetY: 0,
			},
			transform: {
				scale: 1,
				position: { x: 0, y: 200 },
				rotate: 0,
			},
		},
	},
	{
		id: "default",
		name: "Padrão",
		preview: "Texto padrão",
		config: {},
	},
];

export function TextView() {
	const editor = useEditor();
	const fontInputRef = useRef<HTMLInputElement>(null);
	const [uploadedFonts, setUploadedFonts] = useState<string[]>(() => {
		if (typeof window === "undefined") return [];
		try {
			const stored = localStorage.getItem("opencut:custom-fonts");
			return stored ? JSON.parse(stored) : [];
		} catch {
			return [];
		}
	});

	const handleAddPreset = useCallback(
		(preset: TextPreset, currentTime: number) => {
			const element = buildTextElement({
				raw: { ...DEFAULT_TEXT_ELEMENT, ...preset.config },
				startTime: currentTime,
			});
			editor.timeline.insertElement({
				element,
				placement: { mode: "auto" },
			});
		},
		[editor],
	);

	const handleFontUpload = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files;
			if (!files || files.length === 0) return;

			const loaded: string[] = [];

			for (const file of Array.from(files)) {
				if (
					!file.name.endsWith(".ttf") &&
					!file.name.endsWith(".otf") &&
					!file.name.endsWith(".woff") &&
					!file.name.endsWith(".woff2")
				) {
					toast.error(`${file.name}: formato não compatível. Use TTF, OTF, WOFF ou WOFF2.`);
					continue;
				}

				try {
					const fontName = file.name.replace(/\.(ttf|otf|woff2?)$/i, "");
					const buffer = await file.arrayBuffer();
					const fontFace = new FontFace(fontName, buffer);
					await fontFace.load();
					document.fonts.add(fontFace);
					loaded.push(fontName);
				} catch (err) {
					toast.error(`Falha ao carregar ${file.name}`);
					console.error("Font load error:", err);
				}
			}

			if (loaded.length > 0) {
				const updated = [...new Set([...uploadedFonts, ...loaded])];
				setUploadedFonts(updated);
				try {
					localStorage.setItem("opencut:custom-fonts", JSON.stringify(updated));
				} catch { /* ignore */ }
				toast.success(`${loaded.length} fonte${loaded.length > 1 ? "s" : ""} carregada${loaded.length > 1 ? "s" : ""}: ${loaded.join(", ")}`);
			}

			// Reset input
			if (fontInputRef.current) fontInputRef.current.value = "";
		},
		[uploadedFonts],
	);

	return (
		<PanelView title="Texto">
			<div className="flex flex-col gap-4 pb-4">
				{/* Text presets */}
				<div className="flex flex-col gap-2">
					<Label className="text-xs font-medium">Predefinições de texto</Label>
					<div className="grid grid-cols-2 gap-1.5">
						{TEXT_PRESETS.map((preset) => (
							<DraggableItem
								key={preset.id}
								name={preset.name}
								preview={<PresetPreview preset={preset} />}
								dragData={{
									id: `temp-text-${preset.id}`,
									type: "text",
									name: preset.name,
									content: preset.config.content ?? "Text",
									preset: preset.config,
								}}
								aspectRatio={2}
								onAddToTimeline={({ currentTime }) =>
									handleAddPreset(preset, currentTime)
								}
								shouldShowLabel
							/>
						))}
					</div>
				</div>

				{/* Font upload */}
				<div className="border-t pt-3 flex flex-col gap-2">
					<Label className="text-xs font-medium">Fontes personalizadas</Label>
					<p className="text-[11px] text-muted-foreground leading-relaxed">
						Envie arquivos de fonte TTF, OTF, WOFF ou WOFF2 para usar no seu projeto.
					</p>
					<Button
						variant="outline"
						size="sm"
						className="w-full"
						onClick={() => fontInputRef.current?.click()}
					>
						Enviar fontes
					</Button>
					<input
						ref={fontInputRef}
						type="file"
						accept=".ttf,.otf,.woff,.woff2"
						multiple
						className="hidden"
						onChange={handleFontUpload}
					/>

					{uploadedFonts.length > 0 && (
						<div className="flex flex-wrap gap-1 mt-1">
							{uploadedFonts.map((font) => (
								<span
									key={font}
									className="text-[10px] rounded-full border px-2 py-0.5 text-muted-foreground"
									style={{ fontFamily: font }}
								>
									{font}
								</span>
							))}
						</div>
					)}
				</div>
			</div>
		</PanelView>
	);
}

// Same seeded scraps as the renderer would vary; the tile only hints at it
const CUTOUT_PREVIEW_PAPERS = ["#ffffff", "#ffd400", "#111111", "#e63946", "#f3e9d2", "#4cc9f0"];
const CUTOUT_PREVIEW_MONO = ["#ffffff", "#111111", "#ece6d6", "#cfcfcf"];
const CUTOUT_PREVIEW_FONTS = ['"Arial Black", sans-serif', "Georgia, serif", "Impact, sans-serif", '"Courier New", monospace'];

function PresetPreview({ preset }: { preset: TextPreset }) {
	const { config } = preset;
	// Small caption sizes still need a readable tile
	const size = Math.min(14, Math.max(10, (config.fontSize ?? 10) * 0.8));

	if (config.letterStyle === "cutout" || config.letterStyle === "cutout-mono") {
		const papers = config.letterStyle === "cutout" ? CUTOUT_PREVIEW_PAPERS : CUTOUT_PREVIEW_MONO;
		return (
			<div className="bg-accent flex size-full items-center justify-center gap-[2px] rounded p-2">
				{Array.from(preset.preview, (char, position) => ({ char, position })).map(({ char, position: index }) => {
					if (char === " ") return <span key={`gap-${index}`} className="w-1" />;
					const bg = papers[(index * 5 + 1) % papers.length];
					return (
						<span
							key={`${char}-${index}`}
							className="inline-block select-none px-[3px] leading-tight shadow-sm"
							style={{
								background: bg,
								color: bg === "#111111" ? "#ffffff" : "#111111",
								fontFamily: CUTOUT_PREVIEW_FONTS[(index * 3) % CUTOUT_PREVIEW_FONTS.length],
								fontWeight: 800,
								fontSize: 12 + ((index * 7) % 4),
								transform: `rotate(${((index * 37) % 15) - 7}deg)`,
							}}
						>
							{char}
						</span>
					);
				})}
			</div>
		);
	}

	const shadow = config.shadow?.enabled ? config.shadow : null;
	return (
		<div className="bg-accent flex size-full items-center justify-center rounded p-2">
			<span
				className="select-none truncate"
				style={{
					fontSize: size,
					fontWeight: config.fontWeight ?? "normal",
					color: config.color ?? "#ffffff",
					fontFamily: config.fontFamily ?? "Inter",
					...(config.stroke?.enabled && {
						WebkitTextStroke: `${size < 12 ? 1 : 2}px ${config.stroke.color}`,
						paintOrder: "stroke fill",
					}),
					...(shadow && {
						// Hard shadows (no blur) keep their offset; glows stay centered
						textShadow:
							shadow.blur === 0
								? `${Math.sign(shadow.offsetX) * 2}px ${Math.sign(shadow.offsetY) * 2}px 0 ${shadow.color}`
								: `0 ${shadow.offsetY > 0 ? 2 : 0}px ${shadow.offsetY > 0 ? 4 : 8}px ${shadow.color}`,
					}),
					...(config.fillGradient && {
						backgroundImage: `linear-gradient(${config.fillGradient.from}, ${config.fillGradient.to})`,
						WebkitBackgroundClip: "text",
						backgroundClip: "text",
						color: "transparent",
					}),
					...(config.background?.enabled &&
						config.background.color !== "transparent" && {
							backgroundColor: config.background.color,
							borderRadius: (config.background.cornerRadius ?? 0) >= 50 ? 999 : 4,
							padding: "1px 6px",
						}),
				}}
			>
				{preset.preview}
			</span>
		</div>
	);
}
