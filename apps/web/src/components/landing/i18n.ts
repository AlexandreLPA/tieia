// Copy for the landing page and the header and footer around it, in the
// three languages the visitor can pick. Portuguese is the source: the
// English and Spanish texts translate it and must not claim anything more.

export const LANDING_LANGUAGES = [
	{ code: "pt", htmlLang: "pt-BR", short: "PT", name: "Português" },
	{ code: "en", htmlLang: "en", short: "EN", name: "English" },
	{ code: "es", htmlLang: "es", short: "ES", name: "Español" },
] as const;

export type LandingLanguage = (typeof LANDING_LANGUAGES)[number]["code"];

export const DEFAULT_LANDING_LANGUAGE: LandingLanguage = "pt";

const STORAGE_KEY = "tieia-landing-language";

export function isLandingLanguage(value: unknown): value is LandingLanguage {
	return LANDING_LANGUAGES.some((language) => language.code === value);
}

export function htmlLangFor(language: LandingLanguage): string {
	return (
		LANDING_LANGUAGES.find((entry) => entry.code === language)?.htmlLang ??
		"pt-BR"
	);
}

export function readStoredLanguage(): LandingLanguage {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return isLandingLanguage(stored) ? stored : DEFAULT_LANDING_LANGUAGE;
	} catch {
		// storage blocked (private window, previews): fall back to Portuguese
		return DEFAULT_LANDING_LANGUAGE;
	}
}

export function storeLanguage(language: LandingLanguage) {
	try {
		localStorage.setItem(STORAGE_KEY, language);
	} catch {
		// storage blocked: the choice lasts until the page is closed
	}
}

const pt = {
	nav: {
		editor: "Editor",
		models: "Modelos",
		roadmap: "Roadmap",
		changelog: "Novidades",
		contributors: "Contribuidores",
		privacy: "Privacidade",
		terms: "Termos de uso",
		openEditor: "Abrir editor",
		openMenu: "Abrir menu",
		closeMenu: "Fechar menu",
		language: "Idioma",
	},
	hero: {
		title: "Editor de vídeo com IA que roda no seu computador.",
		lead: "Legendas automáticas, voz clonada, cortes para Shorts e Reels e um chat que conhece o seu projeto. Os modelos de IA rodam no Docker da sua máquina, e os vídeos ficam no seu navegador.",
		openProjects: "Abrir meus projetos",
		viewCode: "Ver o código no GitHub",
		license: "Código aberto, licença MIT. Um fork do OpenCut.",
	},
	features: {
		title: "Sua voz, narrando o seu vídeo.",
		lead: "Grave de 10 a 15 segundos de fala e a TiêIA clona a voz com o Chatterbox, na sua placa de vídeo. Escreva o texto, ouça, ponha na linha do tempo ou baixe em MP3 ou WAV.",
		alsoHeading: "E também",
		// What the editor does today. Each entry matches a place in the editor
		// (see lib/editor-ui-map.ts); keep it to features that exist.
		items: [
			{
				title: "Legendas automáticas",
				text: "Transcrição com faster-whisper e legendas prontas para ajustar na linha do tempo.",
			},
			{
				title: "Estúdio de IA",
				text: "Um chat que lê o projeto aberto e ajuda com roteiro, B-roll, capítulos, dublagem, remoção de fundo e reenquadramento. Pergunte onde fica um recurso e ele abre o lugar.",
			},
			{
				title: "Clipes de podcast",
				text: "Encontra os melhores trechos de um vídeo longo para virar cortes.",
			},
			{
				title: "Pontuação Viral",
				text: "Dá nota ao vídeo e confere quadros e falas contra as regras do TikTok Shop.",
			},
			{
				title: "Pesquisa no vídeo",
				text: "Encontra momentos pelo que aparece na imagem, com embeddings CLIP calculados na sua máquina.",
			},
			{
				title: "Criar vídeo com IA",
				text: "Monta um vídeo a partir de um tema, com imagens de banco do Pexels e do Wikimedia Commons.",
			},
			{
				title: "Kit TikTok Shop e GIFs",
				text: 'Setas, botões de "clique aqui" e reações da KLIPY para vídeos de venda.',
			},
			{
				title: "Exportação",
				text: "Formato e resolução à sua escolha, só o áudio em M4A, MP3 ou WAV, e volume no padrão das redes (-14 LUFS).",
			},
		],
		inDevelopment:
			"Em desenvolvimento: busca nas transcrições que junta a palavra exata e o sentido da frase (busca híbrida).",
	},
	whereItRuns: {
		title: "O que roda na sua máquina, e o que vai para a nuvem.",
		localHeading: "Na sua máquina",
		local: [
			"A edição, os projetos e a mídia, guardados no navegador",
			"Transcrição (faster-whisper)",
			"Voz clonada e narração (Chatterbox, Coqui TTS)",
			"Separação de locutores, rastreamento de rosto, tradução, geração de imagens e pesquisa CLIP",
			"LLMs locais pelo Ollama ou pelo TurboQuant, o padrão",
		],
		cloudHeading: "Na nuvem, só se você ligar",
		cloud: [
			{
				what: "Chat e análises com um LLM da OpenRouter, com a sua chave",
				note: "Vai: prompts, transcrições e, na Pontuação Viral, quadros do vídeo.",
			},
			{
				what: "Busca de GIFs da KLIPY, feita pelo navegador",
				note: "Vai: os termos de busca.",
			},
			{
				what: "Imagens de banco do Criar vídeo com IA: Wikimedia Commons, ou o Pexels com a sua chave",
				note: "Vai: os termos de busca do tema. O Wikimedia Commons não pede chave.",
			},
			{
				what: "Geração de vídeo, vozes da Sarvam ou da Smallest e publicação no TikTok",
				note: "Cada um só funciona com a sua chave ou o seu login.",
			},
		],
		footnote:
			"Com o padrão (LLM local) e nenhuma chave configurada, nenhum texto, áudio ou vídeo vai para um provedor de IA. A lista completa está no",
	},
	nameStory: {
		iconAlt:
			"Ícone da TiêIA: o tiê-sangue em traço branco sobre vermelho, com um play no bico",
		title: "Por que tiê",
		beforeSpecies: "O tiê-sangue (",
		afterSpecies:
			") é um pássaro vermelho da Mata Atlântica, fácil de ver no Rio de Janeiro. TiêIA é o tiê mais IA. No ícone, o pássaro aparece num traço branco só, com um botão de play no bico.",
	},
	cta: {
		title: "Rodar na sua máquina",
		requirements:
			"Precisa de Windows 11, Docker Desktop, Bun e uma placa de vídeo NVIDIA.",
		cost: "É grátis e não tem assinatura. O custo é o seu computador e, se você quiser LLMs na nuvem, a sua chave da OpenRouter, onde os modelos grátis não cobram nada.",
		steps: [
			"Baixe o código e crie o seu .env. A chave da OpenRouter é opcional e fica só nele.",
			"Construa os serviços de IA uma vez.",
			"Ligue tudo. O launcher sobe o Docker, prepara o editor e abre a janela.",
		],
		copyCommand: "Copiar comando",
		copied: "Copiado",
	},
	footer: {
		label: "Rodapé",
		about:
			"Editor de vídeo open source com IA, feito para rodar na sua máquina. Licença MIT. Um fork do",
		aboutMiddle: ", que por sua vez é um fork do",
	},
};

export type LandingCopy = typeof pt;

const en: LandingCopy = {
	nav: {
		editor: "Editor",
		models: "Models",
		roadmap: "Roadmap",
		changelog: "What's new",
		contributors: "Contributors",
		privacy: "Privacy",
		terms: "Terms of use",
		openEditor: "Open editor",
		openMenu: "Open menu",
		closeMenu: "Close menu",
		language: "Language",
	},
	hero: {
		title: "An AI video editor that runs on your computer.",
		lead: "Automatic captions, a cloned voice, cuts for Shorts and Reels, and a chat that knows your project. The AI models run in Docker on your machine, and your videos stay in your browser.",
		openProjects: "Open my projects",
		viewCode: "View the code on GitHub",
		license: "Open source, MIT license. A fork of OpenCut.",
	},
	features: {
		title: "Your voice, narrating your video.",
		lead: "Record 10 to 15 seconds of speech and TiêIA clones the voice with Chatterbox, on your graphics card. Write the text, listen, put it on the timeline or download it as MP3 or WAV.",
		alsoHeading: "And also",
		items: [
			{
				title: "Automatic captions",
				text: "Transcription with faster-whisper and captions ready to adjust on the timeline.",
			},
			{
				title: "AI Studio",
				text: "A chat that reads the open project and helps with scripts, B-roll, chapters, dubbing, background removal and reframing. Ask where a feature is and it opens the spot.",
			},
			{
				title: "Podcast clips",
				text: "Finds the best moments in a long video to turn into clips.",
			},
			{
				title: "Viral Score",
				text: "Scores the video and checks frames and speech against TikTok Shop's rules.",
			},
			{
				title: "Search inside the video",
				text: "Finds moments by what appears on screen, with CLIP embeddings computed on your machine.",
			},
			{
				title: "Create a video with AI",
				text: "Builds a video from a topic, with stock images from Pexels and Wikimedia Commons.",
			},
			{
				title: "TikTok Shop kit and GIFs",
				text: 'Arrows, "click here" buttons and KLIPY reactions for sales videos.',
			},
			{
				title: "Export",
				text: "Format and resolution of your choice, audio only as M4A, MP3 or WAV, and loudness at the social media standard (-14 LUFS).",
			},
		],
		inDevelopment:
			"In development: transcript search that combines the exact word and the meaning of the sentence (hybrid search).",
	},
	whereItRuns: {
		title: "What runs on your machine, and what goes to the cloud.",
		localHeading: "On your machine",
		local: [
			"Editing, projects and media, stored in the browser",
			"Transcription (faster-whisper)",
			"Voice cloning and narration (Chatterbox, Coqui TTS)",
			"Speaker separation, face tracking, translation, image generation and CLIP search",
			"Local LLMs through Ollama or TurboQuant, the default",
		],
		cloudHeading: "In the cloud, only if you turn it on",
		cloud: [
			{
				what: "Chat and analysis with an OpenRouter LLM, using your key",
				note: "Sent: prompts, transcripts and, for the Viral Score, video frames.",
			},
			{
				what: "KLIPY GIF search, done from the browser",
				note: "Sent: the search terms.",
			},
			{
				what: "Stock images for Create a video with AI: Wikimedia Commons, or Pexels with your key",
				note: "Sent: the topic's search terms. Wikimedia Commons needs no key.",
			},
			{
				what: "Video generation, Sarvam or Smallest voices and posting to TikTok",
				note: "Each one only works with your key or your login.",
			},
		],
		footnote:
			"With the default (local LLM) and no key configured, no text, audio or video goes to an AI provider. The full list is in the",
	},
	nameStory: {
		iconAlt:
			"TiêIA icon: the tiê-sangue in a white line on red, with a play button in its beak",
		title: "Why tiê",
		beforeSpecies: "The tiê-sangue (",
		afterSpecies:
			") is a red bird of the Atlantic Forest, easy to spot in Rio de Janeiro. TiêIA is tiê plus IA, Portuguese for AI. In the icon, the bird is drawn in a single white line, with a play button in its beak.",
	},
	cta: {
		title: "Run it on your machine",
		requirements:
			"It needs Windows 11, Docker Desktop, Bun and an NVIDIA graphics card.",
		cost: "It's free and there is no subscription. The cost is your computer and, if you want cloud LLMs, your OpenRouter key, where the free models cost nothing.",
		steps: [
			"Download the code and create your .env. The OpenRouter key is optional and stays only there.",
			"Build the AI services once.",
			"Start everything. The launcher brings up Docker, prepares the editor and opens the window.",
		],
		copyCommand: "Copy command",
		copied: "Copied",
	},
	footer: {
		label: "Footer",
		about:
			"Open-source AI video editor, made to run on your machine. MIT license. A fork of",
		aboutMiddle: ", which is itself a fork of",
	},
};

const es: LandingCopy = {
	nav: {
		editor: "Editor",
		models: "Modelos",
		roadmap: "Hoja de ruta",
		changelog: "Novedades",
		contributors: "Colaboradores",
		privacy: "Privacidad",
		terms: "Términos de uso",
		openEditor: "Abrir editor",
		openMenu: "Abrir menú",
		closeMenu: "Cerrar menú",
		language: "Idioma",
	},
	hero: {
		title: "Editor de video con IA que funciona en tu computadora.",
		lead: "Subtítulos automáticos, voz clonada, cortes para Shorts y Reels y un chat que conoce tu proyecto. Los modelos de IA se ejecutan en el Docker de tu máquina, y los videos se quedan en tu navegador.",
		openProjects: "Abrir mis proyectos",
		viewCode: "Ver el código en GitHub",
		license: "Código abierto, licencia MIT. Un fork de OpenCut.",
	},
	features: {
		title: "Tu voz, narrando tu video.",
		lead: "Graba de 10 a 15 segundos de voz y TiêIA la clona con Chatterbox, en tu tarjeta gráfica. Escribe el texto, escúchalo, ponlo en la línea de tiempo o descárgalo en MP3 o WAV.",
		alsoHeading: "Y también",
		items: [
			{
				title: "Subtítulos automáticos",
				text: "Transcripción con faster-whisper y subtítulos listos para ajustar en la línea de tiempo.",
			},
			{
				title: "Estudio de IA",
				text: "Un chat que lee el proyecto abierto y ayuda con el guion, B-roll, capítulos, doblaje, eliminación de fondo y reencuadre. Pregúntale dónde está una función y abre el lugar.",
			},
			{
				title: "Clips de pódcast",
				text: "Encuentra los mejores fragmentos de un video largo para convertirlos en cortes.",
			},
			{
				title: "Puntuación Viral",
				text: "Califica el video y revisa fotogramas y diálogos según las reglas de TikTok Shop.",
			},
			{
				title: "Búsqueda en el video",
				text: "Encuentra momentos por lo que aparece en la imagen, con embeddings CLIP calculados en tu máquina.",
			},
			{
				title: "Crear video con IA",
				text: "Arma un video a partir de un tema, con imágenes de archivo de Pexels y Wikimedia Commons.",
			},
			{
				title: "Kit TikTok Shop y GIFs",
				text: 'Flechas, botones de "haz clic aquí" y reacciones de KLIPY para videos de venta.',
			},
			{
				title: "Exportación",
				text: "Formato y resolución a tu elección, solo el audio en M4A, MP3 o WAV, y volumen en el estándar de las redes (-14 LUFS).",
			},
		],
		inDevelopment:
			"En desarrollo: búsqueda en las transcripciones que combina la palabra exacta y el sentido de la frase (búsqueda híbrida).",
	},
	whereItRuns: {
		title: "Qué se ejecuta en tu máquina y qué va a la nube.",
		localHeading: "En tu máquina",
		local: [
			"La edición, los proyectos y los archivos, guardados en el navegador",
			"Transcripción (faster-whisper)",
			"Voz clonada y narración (Chatterbox, Coqui TTS)",
			"Separación de hablantes, seguimiento de rostros, traducción, generación de imágenes y búsqueda CLIP",
			"LLMs locales con Ollama o con TurboQuant, la opción predeterminada",
		],
		cloudHeading: "En la nube, solo si lo activas",
		cloud: [
			{
				what: "Chat y análisis con un LLM de OpenRouter, con tu clave",
				note: "Se envía: prompts, transcripciones y, en la Puntuación Viral, fotogramas del video.",
			},
			{
				what: "Búsqueda de GIFs de KLIPY, hecha desde el navegador",
				note: "Se envía: los términos de búsqueda.",
			},
			{
				what: "Imágenes de archivo de Crear video con IA: Wikimedia Commons, o Pexels con tu clave",
				note: "Se envía: los términos de búsqueda del tema. Wikimedia Commons no pide clave.",
			},
			{
				what: "Generación de video, voces de Sarvam o Smallest y publicación en TikTok",
				note: "Cada uno solo funciona con tu clave o tu inicio de sesión.",
			},
		],
		footnote:
			"Con la opción predeterminada (LLM local) y ninguna clave configurada, ningún texto, audio o video va a un proveedor de IA. La lista completa está en el",
	},
	nameStory: {
		iconAlt:
			"Ícono de TiêIA: el tiê-sangue en trazo blanco sobre rojo, con un botón de play en el pico",
		title: "Por qué tiê",
		beforeSpecies: "El tiê-sangue (",
		afterSpecies:
			") es un pájaro rojo de la Mata Atlántica, fácil de ver en Río de Janeiro. TiêIA es tiê más IA. En el ícono, el pájaro aparece en un solo trazo blanco, con un botón de play en el pico.",
	},
	cta: {
		title: "Ejecútalo en tu máquina",
		requirements:
			"Necesita Windows 11, Docker Desktop, Bun y una tarjeta gráfica NVIDIA.",
		cost: "Es gratis y no tiene suscripción. El costo es tu computadora y, si quieres LLMs en la nube, tu clave de OpenRouter, donde los modelos gratuitos no cobran nada.",
		steps: [
			"Descarga el código y crea tu .env. La clave de OpenRouter es opcional y queda solo ahí.",
			"Construye los servicios de IA una vez.",
			"Enciende todo. El launcher levanta Docker, prepara el editor y abre la ventana.",
		],
		copyCommand: "Copiar comando",
		copied: "Copiado",
	},
	footer: {
		label: "Pie de página",
		about:
			"Editor de video de código abierto con IA, hecho para ejecutarse en tu máquina. Licencia MIT. Un fork de",
		aboutMiddle: ", que a su vez es un fork de",
	},
};

export const LANDING_COPY: Record<LandingLanguage, LandingCopy> = {
	pt,
	en,
	es,
};
