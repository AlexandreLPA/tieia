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
		license: "Código aberto.",
	},
	features: {
		title: "Sua voz, narrando o seu vídeo.",
		lead: "Grave de 10 a 15 segundos de fala e a Tiê AI clona a voz com o Chatterbox, na sua placa de vídeo. Escreva o texto, ouça, ponha na linha do tempo ou baixe em MP3 ou WAV.",
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
			"Ícone da Tiê AI: o tiê-sangue em traço branco sobre vermelho, com um play no bico",
		title: "Por que tiê",
		beforeSpecies: "O tiê-sangue (",
		afterSpecies:
			") só existe no Brasil. Vive na Mata Atlântica, do Nordeste ao Sul, e aparece até nos parques do Rio de Janeiro. O macho é vermelho-sangue, com asas e cauda pretas, e o nome científico, bresilius, vem do próprio Brasil.",
		why: "A Tiê AI é feita para quem cria vídeos no Brasil, e o tiê é um símbolo brasileiro fácil de reconhecer: um pássaro pequeno, comum e muito vermelho. O nome junta os dois: tiê mais AI, a sigla em inglês de inteligência artificial.",
		iconTitle: "O ícone",
		icon: [
			"Um quadrado de cantos arredondados, com raio de 20% do lado, no vermelho #D2011A, tirado do tiê. Sobre ele, o pássaro em um traço branco só, de espessura constante: um círculo forma a cabeça e o corpo, curvas por dentro dele desenham a asa e o peito, e o bico é um triângulo vazado apontado para a direita.",
			"Dentro do bico fica o único elemento cheio do desenho, um triângulo branco: o botão de play. No cabeçalho e no rodapé, onde o ícone fica pequeno, o traço é mais grosso para não sumir, e no favicon de 16 px o desenho se reduz à cabeça e ao play.",
		],
	},
	cta: {
		title: "Rodar na sua máquina",
		requirements:
			"Roda no Windows 11 com Docker Desktop e Bun. Uma placa de vídeo NVIDIA não é obrigatória, mas sem ela a voz clonada leva minutos por frase.",
		cost: "É grátis e não tem assinatura. O custo é o seu computador e, se você quiser LLMs na nuvem, a sua chave da OpenRouter, onde os modelos grátis não cobram nada.",
		steps: [
			"Baixe o código e crie o seu .env. A chave da OpenRouter é opcional e fica só nele.",
			"Instale os serviços de IA. É só na primeira vez: o Docker baixa e monta as bibliotecas de cada serviço, o que pode levar bastante tempo. Os modelos de IA são baixados depois, na primeira vez que cada recurso é usado.",
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
		license: "Open source.",
	},
	features: {
		title: "Your voice, narrating your video.",
		lead: "Record 10 to 15 seconds of speech and Tiê AI clones the voice with Chatterbox, on your graphics card. Write the text, listen, put it on the timeline or download it as MP3 or WAV.",
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
			"Tiê AI icon: the tiê-sangue in a white line on red, with a play button in its beak",
		title: "Why tiê",
		beforeSpecies: "The tiê-sangue (",
		afterSpecies:
			") lives only in Brazil. It is found in the Atlantic Forest, from the Northeast to the South, and even in Rio de Janeiro's parks. The male is blood red, with black wings and tail, and its scientific name, bresilius, comes from Brazil itself.",
		why: "Tiê AI is made for people who create videos in Brazil, and the tiê is a Brazilian symbol that is easy to recognize: a small, common and very red bird. The name puts the two together: tiê plus AI.",
		iconTitle: "The icon",
		icon: [
			"A square with rounded corners, the radius 20% of the side, in red #D2011A, taken from the tiê. On it, the bird in a single white line of even weight: a circle makes the head and body, curves inside it draw the wing and chest, and the beak is an open triangle pointing right.",
			"Inside the beak sits the only filled shape in the drawing, a white triangle: the play button. In the header and footer, where the icon is small, the line is thicker so it does not disappear, and in the 16 px favicon the drawing comes down to the head and the play.",
		],
	},
	cta: {
		title: "Run it on your machine",
		requirements:
			"Runs on Windows 11 with Docker Desktop and Bun. An NVIDIA graphics card is not required, but without one the cloned voice takes minutes per sentence.",
		cost: "It's free and there is no subscription. The cost is your computer and, if you want cloud LLMs, your OpenRouter key, where the free models cost nothing.",
		steps: [
			"Download the code and create your .env. The OpenRouter key is optional and stays only there.",
			"Install the AI services. Only the first time: Docker downloads and builds each service's libraries, which can take a while. The AI models are downloaded later, the first time each feature is used.",
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
		license: "Código abierto.",
	},
	features: {
		title: "Tu voz, narrando tu video.",
		lead: "Graba de 10 a 15 segundos de voz y Tiê AI la clona con Chatterbox, en tu tarjeta gráfica. Escribe el texto, escúchalo, ponlo en la línea de tiempo o descárgalo en MP3 o WAV.",
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
			"Ícono de Tiê AI: el tiê-sangue en trazo blanco sobre rojo, con un botón de play en el pico",
		title: "Por qué tiê",
		beforeSpecies: "El tiê-sangue (",
		afterSpecies:
			") solo existe en Brasil. Vive en la Mata Atlántica, del Nordeste al Sur, y aparece incluso en los parques de Río de Janeiro. El macho es rojo sangre, con alas y cola negras, y su nombre científico, bresilius, viene del propio Brasil.",
		why: "Tiê AI está hecha para quienes crean videos en Brasil, y el tiê es un símbolo brasileño fácil de reconocer: un pájaro pequeño, común y muy rojo. El nombre une los dos: tiê más AI, la sigla en inglés de inteligencia artificial.",
		iconTitle: "El ícono",
		icon: [
			"Un cuadrado de esquinas redondeadas, con un radio del 20% del lado, en el rojo #D2011A, tomado del tiê. Sobre él, el pájaro en un solo trazo blanco de grosor constante: un círculo forma la cabeza y el cuerpo, curvas por dentro dibujan el ala y el pecho, y el pico es un triángulo vacío que apunta a la derecha.",
			"Dentro del pico está el único elemento relleno del dibujo, un triángulo blanco: el botón de play. En el encabezado y el pie, donde el ícono es pequeño, el trazo es más grueso para no desaparecer, y en el favicon de 16 px el dibujo se reduce a la cabeza y el play.",
		],
	},
	cta: {
		title: "Ejecútalo en tu máquina",
		requirements:
			"Funciona en Windows 11 con Docker Desktop y Bun. Una tarjeta gráfica NVIDIA no es obligatoria, pero sin ella la voz clonada tarda minutos por frase.",
		cost: "Es gratis y no tiene suscripción. El costo es tu computadora y, si quieres LLMs en la nube, tu clave de OpenRouter, donde los modelos gratuitos no cobran nada.",
		steps: [
			"Descarga el código y crea tu .env. La clave de OpenRouter es opcional y queda solo ahí.",
			"Instala los servicios de IA. Solo la primera vez: Docker descarga y prepara las bibliotecas de cada servicio, lo que puede tardar bastante. Los modelos de IA se descargan después, la primera vez que se usa cada función.",
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
