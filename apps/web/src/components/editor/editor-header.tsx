"use client";

import { Button } from "../ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import Link from "next/link";
import { RenameProjectDialog } from "./dialogs/rename-project-dialog";
import { DeleteProjectDialog } from "./dialogs/delete-project-dialog";
import { useRouter } from "next/navigation";

import { ExportButton } from "./export-button";
import { ThemeToggle } from "../theme-toggle";
import { SOCIAL_LINKS } from "@/constants/site-constants";
import { toast } from "sonner";
import { useEditor } from "@/hooks/use-editor";
import { CommandIcon, Logout05Icon, Search01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShortcutsDialog } from "./dialogs/shortcuts-dialog";
import { OpenCutAILogo } from "@/components/footer";
import { cn } from "@/utils/ui";
import { AIStatusIndicator, type AIStatusInfo } from "@/components/editor/ai/ai-status-indicator";
import { ViralityScoreModal } from "@/components/editor/virality-score-modal";
import { useAIStatus } from "@/hooks/use-ai-status";
import { useAIStore } from "@/stores/ai-store";
import { aiClient } from "@/lib/ai-client";
import { MemoryStatusBar, type MemoryStatusInfo } from "@/components/editor/ai/memory-status-bar";
import { SaveStatus } from "@/components/editor/save-status";
import { VersionControlBar } from "@/components/editor/version-control-bar";
import { VersionControlDrawer } from "@/components/editor/version-control-drawer";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";

export function EditorHeader() {
	const { isConnected, backendStatus, error, errorType, refresh } = useAIStatus();
	const toggleSetupGuide = useAIStore((s) => s.toggleSetupGuide);
	const [vcDrawerOpen, setVcDrawerOpen] = useState(false);
	const [viralityOpen, setViralityOpen] = useState(false);

	// Listen for keyboard shortcut events to toggle VC drawer
	useEffect(() => {
		const handler = () => setVcDrawerOpen((prev) => !prev);
		window.addEventListener("opencut:toggle-vc-drawer", handler);
		return () => window.removeEventListener("opencut:toggle-vc-drawer", handler);
	}, []);

	const memoryStatus: MemoryStatusInfo = useMemo(
		() => ({
			gpuUsedMb: backendStatus?.memoryUsage?.gpu?.usedMb ?? 0,
			gpuTotalMb: backendStatus?.memoryUsage?.gpu?.totalMb ?? 0,
			ramUsedMb: backendStatus?.memoryUsage?.ram?.usedMb ?? 0,
			ramTotalMb: backendStatus?.memoryUsage?.ram?.totalMb ?? 0,
		}),
		[backendStatus],
	);

	const aiStatusInfo: AIStatusInfo = useMemo(
		() => ({
			connected: isConnected,
			modelsLoaded: backendStatus?.models ?? [],
			memoryUsageMb: backendStatus?.memoryUsage?.ram?.usedMb ?? 0,
			memoryTotalMb: backendStatus?.memoryUsage?.ram?.totalMb ?? 0,
			gpuAvailable: backendStatus?.gpuAvailable ?? false,
			error: error ?? undefined,
			errorType: errorType ?? undefined,
			backendUrl: aiClient.getBaseUrl(),
		}),
		[isConnected, backendStatus, error, errorType],
	);

	return (
		<header className="bg-background flex h-[3.4rem] items-center justify-between px-3 pt-0.5">
			<div className="flex items-center gap-1">
				<ProjectDropdown />
				<EditableProjectName />
				<SaveStatus className="ml-2" />
			</div>
			<div className="flex items-center gap-2">
				<VersionControlBar onOpenDrawer={() => setVcDrawerOpen(true)} />
			</div>
			<nav className="flex items-center gap-2">
				{isConnected && <MemoryStatusBar status={memoryStatus} />}
				<AIStatusIndicator
					status={aiStatusInfo}
					onSetupClick={toggleSetupGuide}
					onRefresh={refresh}
				/>
				<Button
					variant="outline"
					size="sm"
					className="h-8 gap-1.5 text-xs"
					onClick={() => setViralityOpen(true)}
				>
					<HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
					Pontuação Viral
				</Button>
				<ExportButton />
				<ThemeToggle />
			</nav>
			<VersionControlDrawer open={vcDrawerOpen} onOpenChange={setVcDrawerOpen} />
			<ViralityScoreModal open={viralityOpen} onOpenChange={setViralityOpen} />
		</header>
	);
}

function ProjectDropdown() {
	const [openDialog, setOpenDialog] = useState<
		"delete" | "rename" | "shortcuts" | "features" | null
	>(null);
	const [isExiting, setIsExiting] = useState(false);
	const router = useRouter();
	const editor = useEditor();
	const activeProject = editor.project.getActive();

	const handleExit = async () => {
		if (isExiting) return;
		setIsExiting(true);

		try {
			await editor.project.prepareExit();
			editor.project.closeProject();
		} catch (error) {
			console.error("Failed to prepare project exit:", error);
		} finally {
			editor.project.closeProject();
			router.push("/projects");
		}
	};

	const handleSaveProjectName = async (newName: string) => {
		if (
			activeProject &&
			newName.trim() &&
			newName !== activeProject.metadata.name
		) {
			try {
				await editor.project.renameProject({
					id: activeProject.metadata.id,
					name: newName.trim(),
				});
			} catch (error) {
				toast.error("Falha ao renomear projeto", {
					description:
						error instanceof Error ? error.message : "Tente novamente",
				});
			} finally {
				setOpenDialog(null);
			}
		}
	};

	const handleDeleteProject = async () => {
		if (activeProject) {
			try {
				await editor.project.deleteProjects({
					ids: [activeProject.metadata.id],
				});
				router.push("/projects");
			} catch (error) {
				toast.error("Falha ao excluir projeto", {
					description:
						error instanceof Error ? error.message : "Tente novamente",
				});
			} finally {
				setOpenDialog(null);
			}
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" className="p-0 rounded-sm size-10 [&_svg]:!size-auto">
						<OpenCutAILogo size={36} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="z-100 w-44">
					<DropdownMenuItem
						onClick={handleExit}
						disabled={isExiting}
						icon={<HugeiconsIcon icon={Logout05Icon} />}
					>
						Sair do projeto
					</DropdownMenuItem>

					<DropdownMenuItem
						onClick={() => setOpenDialog("shortcuts")}
						icon={<HugeiconsIcon icon={CommandIcon} />}
					>
						Atalhos de teclado
					</DropdownMenuItem>

					<DropdownMenuItem
						onClick={() => {
							// Dispatch Cmd+Shift+P to open command palette
							window.dispatchEvent(
								new KeyboardEvent("keydown", {
									key: "p",
									ctrlKey: true,
									shiftKey: true,
									bubbles: true,
								}),
							);
						}}
						icon={<HugeiconsIcon icon={Search01Icon} />}
					>
						<span className="flex items-center justify-between w-full">
							Buscar recursos
							<kbd className="text-[10px] text-muted-foreground/50 ml-2">
								Ctrl+Shift+P
							</kbd>
						</span>
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					<DropdownMenuItem
						onClick={() => setOpenDialog("features")}
						icon={<HugeiconsIcon icon={SparklesIcon} />}
					>
						Recursos
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					</DropdownMenuContent>
			</DropdownMenu>
			<RenameProjectDialog
				isOpen={openDialog === "rename"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "rename" : null)}
				onConfirm={(newName) => handleSaveProjectName(newName)}
				projectName={activeProject?.metadata.name || ""}
			/>
			<DeleteProjectDialog
				isOpen={openDialog === "delete"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "delete" : null)}
				onConfirm={handleDeleteProject}
				projectNames={[activeProject?.metadata.name || ""]}
			/>
			<ShortcutsDialog
				isOpen={openDialog === "shortcuts"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "shortcuts" : null)}
			/>
			<FeaturesDialog
				isOpen={openDialog === "features"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "features" : null)}
			/>
		</>
	);
}

function FeaturesDialog({
	isOpen,
	onOpenChange,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { setActiveTab } = useAssetsPanelStore();

	const features = [
		{ name: "Estúdio de IA", desc: "Edição com IA: remove silêncios, vícios de linguagem, gera legendas automáticas", tab: "ai" as const, shortcut: "Ctrl+K" },
		{ name: "Histórico de Versões", desc: "Commits, branches, merge e diff para vídeo, como no Git — sempre na barra do cabeçalho", shortcut: "Ctrl+Shift+S" },
		{ name: "Mídia", desc: "Importe e gerencie arquivos de vídeo, áudio e imagem", tab: "media" as const },
		{ name: "Texto", desc: "Adicione e estilize sobreposições de texto no seu vídeo", tab: "text" as const },
		{ name: "Legendas e Transcrição", desc: "Gera legendas automaticamente a partir da fala", tab: "captions" as const },
		{ name: "Áudio", desc: "Efeitos sonoros, locução com IA e extração de clipes de podcast", tab: "audio" as const },
		{ name: "Elementos", desc: "Figurinhas, emojis e transições de sobreposição", tab: "elements" as const },
		{ name: "Visuais", desc: "Efeitos, filtros de cor e ajustes manuais", tab: "visuals" as const },
		{ name: "Kit de Marca", desc: "Cores, fontes, logotipos e sobreposições rápidas da marca", tab: "brandkit" as const },
		{ name: "Verificação de Fatos", desc: "Verificação de afirmações com IA (em Configurações)", tab: "settings" as const },
		{ name: "Paleta de Comandos", desc: "Busque qualquer recurso, ação ou atalho instantaneamente", shortcut: "Ctrl+Shift+P" },
	];

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Recursos</DialogTitle>
				</DialogHeader>
				<DialogBody className="gap-0 p-0">
					<div className="max-h-[60vh] overflow-y-auto divide-y divide-border/50">
						{features.map((f) => (
							<button
								key={f.name}
								type="button"
								className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
								onClick={() => {
									if (f.tab) {
										setActiveTab(f.tab);
									} else if (f.shortcut) {
										window.dispatchEvent(
											new KeyboardEvent("keydown", {
												key: "p",
												ctrlKey: true,
												shiftKey: true,
												bubbles: true,
											}),
										);
									}
									onOpenChange(false);
								}}
							>
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium">{f.name}</span>
									{f.shortcut && (
										<kbd className="text-[10px] text-muted-foreground/50 px-1.5 py-0.5 rounded border border-border/50 bg-muted/30">
											{f.shortcut}
										</kbd>
									)}
								</div>
								<div className="text-xs text-muted-foreground/60 mt-0.5">
									{f.desc}
								</div>
							</button>
						))}
					</div>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Fechar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function EditableProjectName() {
	const editor = useEditor();
	const activeProject = editor.project.getActive();
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const originalNameRef = useRef("");

	const projectName = activeProject?.metadata.name || "";

	const startEditing = () => {
		if (isEditing) return;
		originalNameRef.current = projectName;
		setIsEditing(true);

		requestAnimationFrame(() => {
			inputRef.current?.select();
		});
	};

	const saveEdit = async () => {
		if (!inputRef.current || !activeProject) return;
		const newName = inputRef.current.value.trim();
		setIsEditing(false);

		if (!newName) {
			inputRef.current.value = originalNameRef.current;
			return;
		}

		if (newName !== originalNameRef.current) {
			try {
				await editor.project.renameProject({
					id: activeProject.metadata.id,
					name: newName,
				});
			} catch (error) {
				toast.error("Falha ao renomear projeto", {
					description:
						error instanceof Error ? error.message : "Tente novamente",
				});
			}
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			inputRef.current?.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			if (inputRef.current) {
				inputRef.current.value = originalNameRef.current;
			}
			setIsEditing(false);
			inputRef.current?.blur();
		}
	};

	return (
		<input
			ref={inputRef}
			type="text"
			defaultValue={projectName}
			readOnly={!isEditing}
			onClick={startEditing}
			onBlur={saveEdit}
			onKeyDown={handleKeyDown}
			style={{ fieldSizing: "content" }}
			className={cn(
				"text-[0.9rem] h-8 px-2 py-1 rounded-sm bg-transparent outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground",
				isEditing && "ring-1 ring-ring cursor-text hover:bg-transparent",
			)}
		/>
	);
}
