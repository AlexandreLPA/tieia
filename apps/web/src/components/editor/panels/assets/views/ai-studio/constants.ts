import type { FrameDensity } from "@/services/compliance/capture-frames";

// Cloud models have large context windows, so they get denser frames
export const CLOUD_FRAME_DENSITY: FrameDensity = {
	secondsPerFrame: 2,
	minFrames: 8,
	maxFrames: 24,
};
export const LOCAL_FRAME_DENSITY: FrameDensity = {
	secondsPerFrame: 4,
	minFrames: 6,
	maxFrames: 8,
};
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_ATTACHMENTS = 4;
// Only the latest user turns with pictures resend them, to keep requests small
export const IMAGE_HISTORY_TURNS = 3;

export const THINKING_MESSAGES = [
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

export const STARTER_PROMPTS = [
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

export const TRANSCRIPT_PROMPTS = [
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
