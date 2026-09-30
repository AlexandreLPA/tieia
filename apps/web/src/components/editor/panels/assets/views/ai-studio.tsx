"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/utils/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	SparklesIcon,
	SentIcon,
	AiMicIcon,
	TextIcon,
	Image01Icon,
	ArrowRight01Icon,
	Bookmark01Icon,
	Delete02Icon,
} from "@hugeicons/core-free-icons";
import { aiClient } from "@/lib/ai-client";
import { useAIStatus } from "@/hooks/use-ai-status";
import { useAIStore } from "@/stores/ai-store";
import { useTranscriptStore } from "@/stores/transcript-store";
import { toast } from "sonner";
import { generateUUID } from "@/utils/id";
import { TemplatePanel } from "@/components/editor/ai/template-panel";
import { BRollSuggestionsPanel } from "@/components/editor/ai/broll-suggestions-panel";
import { YouTubeReelsPanel } from "@/components/editor/youtube/youtube-reels-panel";
import { AIDubbingPanel } from "@/components/editor/panels/assets/views/ai-dubbing";
import { VideoBgRemovalPanel } from "@/components/editor/panels/assets/views/video-bg-removal";
import { AutoBRollPanel } from "@/components/editor/panels/assets/views/auto-broll";
import { EditBySpeakerPanel } from "@/components/editor/panels/assets/views/edit-by-speaker";
import { AutoChaptersPanel } from "@/components/editor/panels/assets/views/auto-chapters";
import { SmartReframePanel } from "@/components/editor/panels/assets/views/smart-reframe";
import { MotionTrackingPanel } from "@/components/editor/panels/assets/views/motion-tracking";
import { ABTestingPanel } from "@/components/editor/panels/assets/views/ab-testing";

// ----- Thinking Messages -----

const THINKING_MESSAGES = [
	"Rebobinando a fita da criatividade...",
	"Ajustando o balanço de branco desta ideia...",
	"Aplicando um zoom dramático nos meus pensamentos...",
	"Percorrendo a linha do tempo das possibilidades...",
	"Aplicando uma transição suave entre os neurônios...",
	"Corrigindo a cor desta resposta para o máximo impacto...",
	"Removendo o silêncio constrangedor do meu raciocínio...",
	"Adicionando B-roll ao fio dos meus pensamentos...",
	"Estabilizando esta ideia tremida...",
	"Renderizando um corte bruto da minha resposta...",
	"Cortando os excessos, mantendo o gancho...",
	"Criando keyframes para a resposta perfeita...",
	"Removendo o ruído do meu processo de pensamento...",
	"Fazendo um corte seco direto para a parte boa...",
	"Puxando o foco para o que importa...",
	"Adicionando um lens flare para efeito dramático...",
	"Acelerando o ritmo nas partes chatas...",
	"Verificando se esta tomada é boa...",
	"Sincronizando o áudio com minhas ondas cerebrais...",
	"Aplicando o filtro viral nesta resposta...",
];

function useThinkingMessage(isThinking: boolean) {
	const [index, setIndex] = useState(() => Math.floor(Math.random() * THINKING_MESSAGES.length));

	useEffect(() => {
		if (!isThinking) return;
		// Pick a random starting message each time thinking begins
		setIndex(Math.floor(Math.random() * THINKING_MESSAGES.length));

		const interval = setInterval(() => {
			setIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
		}, 3000);

		return () => clearInterval(interval);
	}, [isThinking]);

	return THINKING_MESSAGES[index];
}

// ----- Types -----

interface WorkflowStep {
	id: string;
	label: string;
	description: string;
	icon: typeof SparklesIcon;
	action: string;
	isCompleted?: boolean;
}

type StudioMode = "chat" | "workflow" | "transcript" | "templates" | "ideas" | "broll" | "auto-broll" | "youtube-reels" | "dubbing" | "chapters" | "reframe" | "tracking" | "ab-testing" | "video-bg" | "edit-speaker";

// ----- Workflow Steps -----

const VIDEO_WORKFLOWS: {
	id: string;
	title: string;
	description: string;
	steps: WorkflowStep[];
}[] = [
	{
		id: "youtube",
		title: "Vídeo para o YouTube",
		description: "Planeje, roteirize e produza um vídeo para o YouTube",
		steps: [
			{
				id: "brainstorm",
				label: "Brainstorm da ideia",
				description:
					"Descreva seu tema e público. A IA ajuda a refinar sua abordagem.",
				icon: SparklesIcon,
				action: "brainstorm",
			},
			{
				id: "outline",
				label: "Crie um esboço",
				description:
					"A IA gera um esboço estruturado com pontos-chave e marcações de tempo.",
				icon: TextIcon,
				action: "outline",
			},
			{
				id: "script",
				label: "Escreva o roteiro",
				description:
					"Transforme o esboço em um roteiro completo com introdução, desenvolvimento e CTA.",
				icon: TextIcon,
				action: "script",
			},
			{
				id: "record",
				label: "Grave e importe",
				description:
					"Grave seu vídeo seguindo o roteiro e depois importe-o aqui.",
				icon: AiMicIcon,
				action: "import",
			},
			{
				id: "transcribe",
				label: "Transcreva e edite",
				description:
					"Transcreva a gravação e depois edite o texto para editar o vídeo.",
				icon: AiMicIcon,
				action: "transcribe",
			},
			{
				id: "polish",
				label: "Aprimore com IA",
				description:
					"Remova vícios de linguagem e silêncios, adicione legendas e gere a miniatura.",
				icon: Image01Icon,
				action: "polish",
			},
		],
	},
	{
		id: "short",
		title: "Conteúdo em formato curto",
		description: "TikTok, Reels ou YouTube Shorts",
		steps: [
			{
				id: "hook",
				label: "Crie o gancho",
				description:
					"A IA ajuda a escrever um gancho de 3 segundos que prende a atenção.",
				icon: SparklesIcon,
				action: "hook",
			},
			{
				id: "script",
				label: "Roteirize o conteúdo",
				description:
					"Mantenha direto ao ponto — a IA estrutura sua mensagem para 30-60 segundos.",
				icon: TextIcon,
				action: "script-short",
			},
			{
				id: "record",
				label: "Grave na vertical",
				description:
					"Filme no formato retrato 9:16 seguindo o roteiro.",
				icon: AiMicIcon,
				action: "import",
			},
			{
				id: "edit",
				label: "Edição com cortes rápidos",
				description:
					"Remova silêncios e vícios de linguagem para um ritmo mais dinâmico.",
				icon: SparklesIcon,
				action: "fast-edit",
			},
			{
				id: "subtitles",
				label: "Adicione legendas chamativas",
				description:
					"A maioria assiste sem som — adicione legendas animadas.",
				icon: TextIcon,
				action: "subtitles",
			},
		],
	},
	{
		id: "podcast",
		title: "Episódio de podcast",
		description: "Grave, limpe e corte trechos de um podcast",
		steps: [
			{
				id: "plan",
				label: "Planeje o episódio",
				description:
					"A IA ajuda a estruturar temas, perguntas e pontos de discussão.",
				icon: SparklesIcon,
				action: "plan-podcast",
			},
			{
				id: "import",
				label: "Importe a gravação",
				description: "Importe a gravação do seu podcast.",
				icon: AiMicIcon,
				action: "import",
			},
			{
				id: "clean",
				label: "Limpe o áudio",
				description:
					"Remova ruídos de fundo e normalize os níveis.",
				icon: SparklesIcon,
				action: "clean-audio",
			},
			{
				id: "transcribe",
				label: "Transcreva e encontre cortes",
				description:
					"Transcreva para navegar facilmente e encontrar os melhores momentos.",
				icon: TextIcon,
				action: "transcribe",
			},
			{
				id: "clip",
				label: "Crie cortes de destaque",
				description:
					"A IA identifica os melhores trechos para cortes de redes sociais.",
				icon: Image01Icon,
				action: "highlights",
			},
		],
	},
];

// ----- Chat Prompts -----

const STARTER_PROMPTS = [
	{
		label: "Me ajude a planejar um vídeo para o YouTube sobre...",
		prompt: "Me ajude a planejar um vídeo para o YouTube. Quero fazer um vídeo sobre ",
	},
	{
		label: "Escreva um roteiro para um reel de 60 segundos",
		prompt:
			"Escreva um roteiro para um vídeo vertical/reel de 60 segundos sobre ",
	},
	{
		label: "Me dê 5 ideias de vídeo sobre...",
		prompt: "Me dê 5 ideias únicas de conteúdo em vídeo sobre ",
	},
	{
		label: "Me ajude a escrever uma introdução de vídeo",
		prompt:
			"Me ajude a escrever uma introdução de vídeo cativante de 10 segundos para um vídeo sobre ",
	},
	{
		label: "Crie um esboço para um tutorial",
		prompt:
			"Crie um esboço detalhado para um vídeo tutorial sobre ",
	},
	{
		label: "Sugira um conceito de miniatura",
		prompt:
			"Descreva um conceito de miniatura cativante para um vídeo sobre ",
	},
];

const TRANSCRIPT_PROMPTS = [
	{
		label: "Deixar mais conciso",
		prompt: "Reescreva esta transcrição para ficar mais concisa. Remova frases redundantes e torne a linguagem mais direta, mantendo o mesmo significado:\n\n",
	},
	{
		label: "Deixar mais profissional",
		prompt: "Reescreva esta transcrição em um tom mais profissional e refinado:\n\n",
	},
	{
		label: "Simplificar a linguagem",
		prompt: "Reescreva esta transcrição usando uma linguagem mais simples e acessível, que qualquer público consiga entender:\n\n",
	},
	{
		label: "Adicionar mais energia",
		prompt: "Reescreva esta transcrição para ficar mais envolvente e energética, com ganchos mais fortes e frases mais dinâmicas:\n\n",
	},
	{
		label: "Corrigir gramática e fluidez",
		prompt: "Corrija problemas de gramática e melhore a fluidez desta transcrição, mantendo o significado original:\n\n",
	},
	{
		label: "Resumir os pontos principais",
		prompt: "Resuma os pontos principais desta transcrição em tópicos:\n\n",
	},
];

// ----- Component -----

export function AIStudioView() {
	const { isConnected } = useAIStatus();
	const toggleSetupGuide = useAIStore((s) => s.toggleSetupGuide);
	const saveIdea = useAIStore((s) => s.saveIdea);
	const savedIdeas = useAIStore((s) => s.savedIdeas);
	const removeIdea = useAIStore((s) => s.removeIdea);
	const clearIdeas = useAIStore((s) => s.clearIdeas);
	const messages = useAIStore((s) => s.studioMessages);
	const addMessage = useAIStore((s) => s.addStudioMessage);
	const updateMessage = useAIStore((s) => s.updateStudioMessage);
	const clearMessages = useAIStore((s) => s.clearStudioMessages);
	const pendingAutoPrompt = useAIStore((s) => s.pendingAutoPrompt);
	const setPendingAutoPrompt = useAIStore((s) => s.setPendingAutoPrompt);
	const transcriptSegments = useTranscriptStore((s) => s.segments);
	const hasTranscript = transcriptSegments.length > 0;

	const [mode, setMode] = useState<StudioMode>("chat");
	const [inputValue, setInputValue] = useState("");
	const [isThinking, setIsThinking] = useState(false);
	const thinkingMessage = useThinkingMessage(isThinking);
	const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(
		null,
	);
	const [completedSteps, setCompletedSteps] = useState<Set<string>>(
		new Set(),
	);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	// ── Model name display ──
	const [activeModel, setActiveModel] = useState("");

	useEffect(() => {
		aiClient.llmStatus().then((data) => {
			if (data.available) {
				setActiveModel(data.default_model || "");
			}
		}).catch(() => {});
	}, []);

	// Auto-scroll on new messages
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages, isThinking]);

	const handleSend = useCallback(async (overrideText?: string) => {
		const trimmed = (overrideText ?? inputValue).trim();
		if (!trimmed || isThinking) return;

		if (!isConnected) {
			toast.error("O back-end de IA não está conectado", {
				description: "Inicie o back-end de IA para usar o Estúdio de IA.",
			});
			return;
		}

		addMessage({
			id: generateUUID(),
			role: "user",
			content: trimmed,
		});
		if (!overrideText) setInputValue("");
		setIsThinking(true);

		const assistantId = generateUUID();
		let messageAdded = false;

		try {
			let prompt = trimmed;
			let systemPrompt: string | undefined;

			// A prompt handed in from elsewhere (e.g. the Virality Score modal)
			// is already fully self-contained — skip the transcript-mode injection.
			if (!overrideText && mode === "transcript" && hasTranscript) {
				const fullText = transcriptSegments.map((s) => s.text).join(" ");
				systemPrompt =
					"You are a video script editor. The user has a video transcript and wants you to help edit, rewrite, or improve it. " +
					"When rewriting, preserve the key information but improve the text as requested. " +
					"Return only the improved text, not explanations.";
				if (!prompt.includes(fullText.slice(0, 50))) {
					prompt = `${prompt}\n\nTranscript:\n${fullText}`;
				}
			}

			const result = await aiClient.chatStream(
				prompt,
				(_token, accumulated) => {
					if (!messageAdded) {
						// Add the assistant message only when the first token arrives
						addMessage({
							id: assistantId,
							role: "assistant",
							content: accumulated,
						});
						messageAdded = true;
					} else {
						updateMessage(assistantId, accumulated);
					}
				},
				systemPrompt,
			);

			// Final update with complete response
			if (!result.response) {
				if (!messageAdded) {
					addMessage({
						id: assistantId,
						role: "assistant",
						content: "Aqui está o que eu sugiro com base no seu pedido.",
					});
				} else {
					updateMessage(assistantId, "Aqui está o que eu sugiro com base no seu pedido.");
				}
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : "";
			const isOllamaDown = detail.includes("503") || detail.includes("Ollama");
			const errorContent = isOllamaDown
				? "O Ollama não está em execução ou nenhum modelo de LLM foi carregado. Abra o Guia de configuração de IA (clique no indicador de IA no cabeçalho) para baixar um modelo como `llama3.2:1b`."
				: `Algo deu errado: ${detail || "Erro desconhecido"}. Verifique se o back-end de IA e o Ollama estão em execução com um modelo carregado.`;

			if (!messageAdded) {
				addMessage({ id: assistantId, role: "assistant", content: errorContent });
			} else {
				updateMessage(assistantId, errorContent);
			}
		} finally {
			setIsThinking(false);
		}
	}, [inputValue, isThinking, isConnected, mode, hasTranscript, transcriptSegments, addMessage, updateMessage]);

	// Auto-send a prompt handed in from elsewhere in the app (e.g. "Ask AI"
	// on the Virality Score modal), then clear it so it only fires once.
	useEffect(() => {
		if (pendingAutoPrompt) {
			const prompt = pendingAutoPrompt;
			setPendingAutoPrompt(null);
			handleSend(prompt);
		}
	}, [pendingAutoPrompt, setPendingAutoPrompt, handleSend]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				handleSend();
			}
		},
		[handleSend],
	);

	const handleStarterPrompt = (prompt: string) => {
		setInputValue(prompt);
		requestAnimationFrame(() => {
			inputRef.current?.focus();
			if (inputRef.current) {
				inputRef.current.selectionStart = prompt.length;
				inputRef.current.selectionEnd = prompt.length;
			}
		});
	};

	const handleStepClick = (stepId: string) => {
		setCompletedSteps((prev) => {
			const next = new Set(prev);
			if (next.has(stepId)) {
				next.delete(stepId);
			} else {
				next.add(stepId);
			}
			return next;
		});
	};

	const activeWorkflow = VIDEO_WORKFLOWS.find(
		(w) => w.id === selectedWorkflow,
	);

	return (
		<div className="relative flex h-full flex-col overflow-hidden">
			{/* Header */}
			<div className="bg-background h-11 shrink-0 px-4 pr-2 flex items-center justify-between border-b">
				<div className="flex items-center gap-2">
					{activeModel && (
						<Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
							{activeModel}
						</Badge>
					)}
					{!isConnected && (
						<Badge variant="outline" className="text-[8px] px-1.5 py-0 text-yellow-500 border-yellow-500/30">
							Offline
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-1">
					{(mode === "chat" || mode === "transcript") && messages.length > 0 && (
						<Button
							variant="ghost"
							size="sm"
							className="h-6 text-[10px] px-1.5 text-muted-foreground"
							onClick={clearMessages}
						>
							<HugeiconsIcon icon={Delete02Icon} className="size-3" />
						</Button>
					)}
					{hasTranscript && (
						<Button
							variant={mode === "transcript" ? "secondary" : "ghost"}
							size="sm"
							className="h-6 text-[10px] px-2"
							onClick={() => setMode("transcript")}
						>
							Roteiro
						</Button>
					)}
					<Button
						variant={mode === "chat" ? "secondary" : "ghost"}
						size="sm"
						className="h-6 text-[10px] px-2"
						onClick={() => setMode("chat")}
					>
						Chat
					</Button>
					<Button
						variant={mode === "templates" ? "secondary" : "ghost"}
						size="sm"
						className="h-6 text-[10px] px-2"
						onClick={() => setMode("templates")}
					>
						Modelos
					</Button>
					<Button
						variant={mode === "ideas" ? "secondary" : "ghost"}
						size="sm"
						className="h-6 text-[10px] px-2 gap-1"
						onClick={() => setMode("ideas")}
					>
						Ideias
						{savedIdeas.length > 0 && (
							<span className="bg-primary text-primary-foreground rounded-full text-[8px] size-4 flex items-center justify-center font-bold">
								{savedIdeas.length}
							</span>
						)}
					</Button>
					{hasTranscript && (
						<Button
							variant={mode === "broll" ? "secondary" : "ghost"}
							size="sm"
							className="h-6 text-[10px] px-2"
							onClick={() => setMode("broll")}
						>
							B-Roll
						</Button>
					)}
					{hasTranscript && (
						<Button
							variant={mode === "auto-broll" ? "secondary" : "ghost"}
							size="sm"
							className="h-6 text-[10px] px-2"
							onClick={() => setMode("auto-broll")}
						>
							Auto B-Roll
						</Button>
					)}
					{hasTranscript && (
						<Button
							variant={mode === "edit-speaker" ? "secondary" : "ghost"}
							size="sm"
							className="h-6 text-[10px] px-2"
							onClick={() => setMode("edit-speaker")}
						>
							Falantes
						</Button>
					)}
					{hasTranscript && (
						<Button
							variant={mode === "dubbing" ? "secondary" : "ghost"}
							size="sm"
							className="h-6 text-[10px] px-2"
							onClick={() => setMode("dubbing")}
						>
							Dublagem
						</Button>
					)}
					<Button
						variant={mode === "video-bg" ? "secondary" : "ghost"}
						size="sm"
						className="h-6 text-[10px] px-2"
						onClick={() => setMode("video-bg")}
					>
						Remover fundo
					</Button>
					{hasTranscript && (
						<Button
							variant={mode === "chapters" ? "secondary" : "ghost"}
							size="sm"
							className="h-6 text-[10px] px-2"
							onClick={() => setMode("chapters")}
						>
							Capítulos
						</Button>
					)}
					<Button
						variant={mode === "workflow" ? "secondary" : "ghost"}
						size="sm"
						className="h-6 text-[10px] px-2"
						onClick={() => setMode("workflow")}
					>
						Fluxos de trabalho
					</Button>
					<Button
						variant={mode === "youtube-reels" ? "secondary" : "ghost"}
						size="sm"
						className="h-6 text-[10px] px-2"
						onClick={() => setMode("youtube-reels")}
					>
						YT Reels
					</Button>
					<Button
						variant={mode === "reframe" ? "secondary" : "ghost"}
						size="sm"
						className="h-6 text-[10px] px-2"
						onClick={() => setMode("reframe")}
					>
						Reenquadrar
					</Button>
					<Button
						variant={mode === "tracking" ? "secondary" : "ghost"}
						size="sm"
						className="h-6 text-[10px] px-2"
						onClick={() => setMode("tracking")}
					>
						Rastreamento
					</Button>
					<Button
						variant={mode === "ab-testing" ? "secondary" : "ghost"}
						size="sm"
						className="h-6 text-[10px] px-2"
						onClick={() => setMode("ab-testing")}
					>
						Teste A/B
					</Button>
				</div>
			</div>

			{/* Not connected banner */}
			{!isConnected && (
				<div className="mx-2 mt-2 rounded-lg bg-yellow-500/10 px-3 py-2 text-[11px] text-yellow-500 shrink-0">
					<p className="font-medium">Back-end de IA não conectado</p>
					<p className="text-yellow-500/70 mt-0.5">
						Inicie o back-end para usar o brainstorm com IA.
					</p>
					<Button
						variant="outline"
						size="sm"
						className="h-6 text-[10px] mt-1.5"
						onClick={toggleSetupGuide}
					>
						Guia de configuração
					</Button>
				</div>
			)}

			{/* ── Chat / Transcript Mode ── */}
			{(mode === "chat" || mode === "transcript") && (
				<>
					{/* Scrollable messages — fills available space */}
					<div
						ref={scrollRef}
						className="flex-1 min-h-0 overflow-y-auto px-2 py-2"
					>
						{messages.length === 0 && mode === "transcript" && hasTranscript && (
							<div className="flex flex-col gap-3 py-4 px-1">
								<div className="text-center">
									<HugeiconsIcon
										icon={TextIcon}
										className="size-8 text-muted-foreground/30 mx-auto mb-2"
									/>
									<p className="text-xs font-medium">
										Edite o roteiro com IA
									</p>
									<p className="text-[10px] text-muted-foreground mt-0.5">
										Reescreva, aprimore ou transforme sua transcrição
									</p>
								</div>

								<div className="rounded-md bg-muted/50 px-3 py-2 max-h-32 overflow-y-auto">
									<p className="text-[10px] text-muted-foreground leading-relaxed">
										{transcriptSegments.map((s) => s.text).join(" ").slice(0, 300)}
										{transcriptSegments.map((s) => s.text).join(" ").length > 300 && "..."}
									</p>
								</div>

								<div className="flex flex-col gap-1.5">
									{TRANSCRIPT_PROMPTS.map((starter) => (
										<button
											key={starter.label}
											type="button"
											onClick={() => {
												const fullText = transcriptSegments.map((s) => s.text).join(" ");
												handleStarterPrompt(starter.prompt + fullText);
											}}
											className="text-left rounded-md border px-2.5 py-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
										>
											{starter.label}
										</button>
									))}
								</div>
							</div>
						)}

						{messages.length === 0 && mode === "chat" && (
							<div className="flex flex-col gap-3 py-4 px-1">
								<div className="text-center">
									<HugeiconsIcon
										icon={SparklesIcon}
										className="size-8 text-muted-foreground/30 mx-auto mb-2"
									/>
									<p className="text-xs font-medium">
										Brainstorm com IA
									</p>
									<p className="text-[10px] text-muted-foreground mt-0.5">
										Planeje seu vídeo, escreva roteiros, gere
										ideias
									</p>
								</div>

								<div className="flex flex-col gap-1.5">
									{STARTER_PROMPTS.map((starter) => (
										<button
											key={starter.label}
											type="button"
											onClick={() =>
												handleStarterPrompt(
													starter.prompt,
												)
											}
											className="text-left rounded-md border px-2.5 py-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
										>
											{starter.label}
										</button>
									))}
								</div>
							</div>
						)}

						{messages.map((msg) => (
							<div key={msg.id} className="mb-3">
								{msg.role === "user" ? (
									<div className="rounded-lg bg-primary text-primary-foreground ml-6 px-3 py-2 text-xs">
										{msg.content}
									</div>
								) : (
									<div className="rounded-lg bg-muted mr-2 px-3 py-2.5">
										<div className="prose-studio text-xs leading-relaxed">
											<ReactMarkdown
												components={{
													h1: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
													h2: ({ children }) => <h4 className="text-xs font-bold mt-2 mb-1">{children}</h4>,
													h3: ({ children }) => <h4 className="text-xs font-semibold mt-1.5 mb-0.5">{children}</h4>,
													p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
													strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
													em: ({ children }) => <em className="italic">{children}</em>,
													ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
													ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
													li: ({ children }) => <li>{children}</li>,
													code: ({ children, className }) => {
														const isBlock = className?.includes("language-");
														if (isBlock) {
															return (
																<pre className="bg-background rounded px-2 py-1.5 my-1.5 overflow-x-auto text-[10px] font-mono">
																	<code>{children}</code>
																</pre>
															);
														}
														return (
															<code className="bg-background rounded px-1 py-0.5 text-[10px] font-mono">{children}</code>
														);
													},
													blockquote: ({ children }) => (
														<blockquote className="border-l-2 border-primary/40 pl-2 my-1.5 text-muted-foreground italic">
															{children}
														</blockquote>
													),
												}}
											>
												{msg.content}
											</ReactMarkdown>
										</div>
										<div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-border/50">
											<Button
												variant="ghost"
												size="sm"
												className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
												onClick={() => {
													saveIdea(msg.content);
													toast.success("Ideia salva", {
														description: "Veja na aba Ideias.",
														action: {
															label: "Ver",
															onClick: () => setMode("ideas"),
														},
													});
												}}
											>
												<HugeiconsIcon icon={Bookmark01Icon} className="size-3" />
												Salvar ideia
											</Button>
										</div>
									</div>
								)}
							</div>
						))}

						{isThinking && (
							<div className="mx-2 my-1">
								<div className="border border-dashed border-primary/30 rounded-lg px-3 py-2.5 bg-primary/[0.03]">
									<div className="flex items-center gap-2">
										<Spinner className="size-3 text-primary/60" />
										<span className="text-[11px] text-primary/70 font-medium animate-pulse">
											{thinkingMessage}
										</span>
									</div>
								</div>
							</div>
						)}
					</div>

					{/* Input — ALWAYS at bottom, outside scroll */}
					<div className="border-t px-2 py-2 shrink-0 bg-background">
						<div className="flex items-end gap-1.5">
							<textarea
								ref={inputRef}
								value={inputValue}
								onChange={(event) =>
									setInputValue(event.target.value)
								}
								onKeyDown={handleKeyDown}
								placeholder={
									!isConnected
										? "Conecte o back-end de IA primeiro"
										: mode === "transcript"
											? "Diga à IA como editar a transcrição..."
											: "Descreva a ideia do seu vídeo..."
								}
								disabled={!isConnected}
								rows={1}
								className={cn(
									"flex-1 resize-none rounded-md border bg-transparent px-2.5 py-2 text-xs outline-none",
									"focus:ring-1 focus:ring-ring",
									"placeholder:text-muted-foreground/50",
									"disabled:opacity-50",
									"min-h-[36px] max-h-[100px]",
								)}
								style={
									{
										fieldSizing: "content",
									} as React.CSSProperties
								}
							/>
							<Button
								size="icon"
								variant={
									inputValue.trim() ? "default" : "secondary"
								}
								className="size-[36px] shrink-0"
								onClick={() => handleSend()}
								disabled={
									!inputValue.trim() ||
									isThinking ||
									!isConnected
								}
							>
								{isThinking ? (
									<Spinner className="size-3.5" />
								) : (
									<HugeiconsIcon
										icon={SentIcon}
										className="size-3.5"
									/>
								)}
							</Button>
						</div>
						<p className="text-[9px] text-muted-foreground mt-1 text-center">
							Enter para enviar &middot; Shift+Enter para nova linha
						</p>
					</div>
				</>
			)}

			{/* ── Templates Mode ── */}
			{mode === "templates" && (
				<TemplatePanel className="flex-1 min-h-0" />
			)}

			{/* ── B-Roll Mode ── */}
			{mode === "broll" && (
				<BRollSuggestionsPanel className="flex-1 min-h-0" />
			)}

			{/* ── Auto B-roll from your footage (CLIP) ── */}
			{mode === "auto-broll" && (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<AutoBRollPanel />
				</div>
			)}

			{/* ── Edit by Speaker (diarization) ── */}
			{mode === "edit-speaker" && (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<EditBySpeakerPanel />
				</div>
			)}

			{/* ── Dubbing Mode ── */}
			{mode === "dubbing" && (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<AIDubbingPanel />
				</div>
			)}

			{/* ── Video Background Removal Mode ── */}
			{mode === "video-bg" && (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<VideoBgRemovalPanel />
				</div>
			)}

			{/* ── Auto Chapters Mode ── */}
			{mode === "chapters" && (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<AutoChaptersPanel />
				</div>
			)}

			{/* ── YouTube Reels Mode ── */}
			{mode === "youtube-reels" && (
				<div className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
					<YouTubeReelsPanel />
				</div>
			)}

			{/* ── Smart Reframe Mode ── */}
			{mode === "reframe" && (
				<SmartReframePanel className="flex-1 min-h-0" />
			)}

			{/* ── Motion Tracking Mode ── */}
			{mode === "tracking" && (
				<MotionTrackingPanel className="flex-1 min-h-0" />
			)}

			{/* ── A/B Testing Mode ── */}
			{mode === "ab-testing" && (
				<ABTestingPanel className="flex-1 min-h-0" />
			)}


			{/* ── Ideas Mode ── */}
			{mode === "ideas" && (
				<div className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
					{savedIdeas.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
							<HugeiconsIcon
								icon={Bookmark01Icon}
								className="size-8 text-muted-foreground/30"
							/>
							<p className="text-xs font-medium">Nenhuma ideia salva ainda</p>
							<p className="text-[10px] text-muted-foreground leading-relaxed">
								Converse com a IA e clique em &ldquo;Salvar ideia&rdquo; em qualquer resposta para guardá-la aqui.
							</p>
							<Button
								variant="outline"
								size="sm"
								className="h-7 text-[11px] mt-2"
								onClick={() => setMode("chat")}
							>
								<HugeiconsIcon icon={SparklesIcon} className="size-3 mr-1" />
								Começar brainstorm
							</Button>
						</div>
					) : (
						<>
							<div className="flex items-center justify-between px-1 mb-2">
								<p className="text-[11px] text-muted-foreground">
									{savedIdeas.length} ideia{savedIdeas.length !== 1 ? "s" : ""} salva{savedIdeas.length !== 1 ? "s" : ""}
								</p>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 text-[10px] px-1.5 text-muted-foreground"
									onClick={clearIdeas}
								>
									<HugeiconsIcon icon={Delete02Icon} className="size-3 mr-0.5" />
									Limpar tudo
								</Button>
							</div>
							<div className="flex flex-col gap-2">
								{savedIdeas.map((idea) => (
									<div
										key={idea.id}
										className="rounded-lg border px-3 py-2.5 group relative"
									>
										<div className="text-xs leading-relaxed line-clamp-6 pr-6">
											<ReactMarkdown
												components={{
													p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
													strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
													ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
													ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
													li: ({ children }) => <li>{children}</li>,
												}}
											>
												{idea.content.length > 500
													? `${idea.content.slice(0, 500)}...`
													: idea.content}
											</ReactMarkdown>
										</div>
										<div className="flex items-center justify-between mt-2 pt-1.5 border-t border-border/50">
											<span className="text-[9px] text-muted-foreground">
												{new Date(idea.savedAt).toLocaleDateString(undefined, {
													month: "short",
													day: "numeric",
													hour: "2-digit",
													minute: "2-digit",
												})}
											</span>
											<Button
												variant="ghost"
												size="sm"
												className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
												onClick={() => removeIdea(idea.id)}
											>
												<HugeiconsIcon icon={Delete02Icon} className="size-3" />
											</Button>
										</div>
									</div>
								))}
							</div>
						</>
					)}
				</div>
			)}

			{/* ── Workflow Mode ── */}
			{mode === "workflow" && !activeWorkflow && (
				<div className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
					<p className="text-[11px] text-muted-foreground px-1 mb-2">
						Siga um guia passo a passo para criar seu vídeo, da
						ideia à exportação.
					</p>
					{VIDEO_WORKFLOWS.map((workflow) => (
						<button
							key={workflow.id}
							type="button"
							onClick={() => setSelectedWorkflow(workflow.id)}
							className="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-accent transition-colors w-full mb-2"
						>
							<HugeiconsIcon
								icon={SparklesIcon}
								className="size-4 text-primary mt-0.5 shrink-0"
							/>
							<div className="flex-1 min-w-0">
								<p className="text-xs font-medium">
									{workflow.title}
								</p>
								<p className="text-[10px] text-muted-foreground mt-0.5">
									{workflow.description}
								</p>
								<Badge
									variant="secondary"
									className="text-[9px] mt-1.5"
								>
									{workflow.steps.length} etapas
								</Badge>
							</div>
							<HugeiconsIcon
								icon={ArrowRight01Icon}
								className="size-3.5 text-muted-foreground mt-1 shrink-0"
							/>
						</button>
					))}
				</div>
			)}

			{/* ── Active Workflow ── */}
			{mode === "workflow" && activeWorkflow && (
				<div className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
					<div className="flex items-center gap-2 px-1 mb-1">
						<button
							type="button"
							onClick={() => setSelectedWorkflow(null)}
							className="text-[10px] text-muted-foreground hover:text-foreground"
						>
							Fluxos de trabalho
						</button>
						<span className="text-[10px] text-muted-foreground">
							/
						</span>
						<span className="text-[11px] font-medium">
							{activeWorkflow.title}
						</span>
					</div>

					{/* Progress */}
					<div className="flex items-center gap-2 px-1 mb-2">
						<div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
							<div
								className="h-full bg-primary rounded-full transition-all"
								style={{
									width: `${(completedSteps.size / activeWorkflow.steps.length) * 100}%`,
								}}
							/>
						</div>
						<span className="text-[10px] text-muted-foreground tabular-nums">
							{completedSteps.size}/{activeWorkflow.steps.length}
						</span>
					</div>

					{/* Steps */}
					<div className="flex flex-col gap-2">
						{activeWorkflow.steps.map((step, index) => {
							const isCompleted = completedSteps.has(step.id);
							const isActive =
								!isCompleted &&
								(index === 0 ||
									completedSteps.has(
										activeWorkflow.steps[index - 1].id,
									));

							return (
								<button
									key={step.id}
									type="button"
									onClick={() => handleStepClick(step.id)}
									className={cn(
										"flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all",
										isCompleted &&
											"border-green-500/30 bg-green-500/5",
										isActive &&
											"border-primary/30 bg-primary/5",
										!isCompleted &&
											!isActive &&
											"opacity-60",
									)}
								>
									<div
										className={cn(
											"flex items-center justify-center size-5 rounded-full text-[9px] font-bold shrink-0 mt-0.5",
											isCompleted
												? "bg-green-500 text-white"
												: isActive
													? "bg-primary text-primary-foreground"
													: "bg-muted text-muted-foreground",
										)}
									>
										{isCompleted ? "\u2713" : index + 1}
									</div>

									<div className="flex-1 min-w-0">
										<p
											className={cn(
												"text-[11px] font-medium",
												isCompleted &&
													"line-through text-muted-foreground",
											)}
										>
											{step.label}
										</p>
										<p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
											{step.description}
										</p>
									</div>
								</button>
							);
						})}

						{/* Ask AI about this step */}
						{isConnected && (
							<Button
								variant="outline"
								size="sm"
								className="h-7 text-[11px] mt-1"
								onClick={() => {
									setMode("chat");
									const currentStep =
										activeWorkflow.steps.find(
											(step) =>
												!completedSteps.has(step.id),
										);
									if (currentStep) {
										setInputValue(
											`Me ajude com "${currentStep.label}" para o meu ${activeWorkflow.title}. ${currentStep.description}`,
										);
										requestAnimationFrame(() =>
											inputRef.current?.focus(),
										);
									}
								}}
							>
								<HugeiconsIcon
									icon={SparklesIcon}
									className="size-3 mr-1"
								/>
								Perguntar à IA sobre a próxima etapa
							</Button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
