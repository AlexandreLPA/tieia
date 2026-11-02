import type { Metadata } from "next";
import { BasePage } from "@/app/base-page";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { SOCIAL_LINKS } from "@/constants/site-constants";

const DESCRIPTION =
	"Como a TiêIA trata os seus dados: o que fica no seu computador e o que só vai para a internet quando você liga um serviço.";

export const metadata: Metadata = {
	title: "Política de privacidade - TiêIA",
	description: DESCRIPTION,
	openGraph: {
		title: "Política de privacidade - TiêIA",
		description: DESCRIPTION,
		type: "website",
	},
};

// What can leave the machine, when, and what goes. Keep it in step with the
// code: services/ai-backend/app/config.py, settings/api-keys.tsx, lib/klipy.ts
const CLOUD_SERVICES = [
	{
		name: "OpenRouter (LLMs na nuvem)",
		when: "Quando você escolhe um modelo de nuvem em “Gerenciar serviços de IA” ou define AI_LLM_BACKEND=openrouter, com a sua chave.",
		what: "As mensagens do chat do Estúdio, o contexto do projeto (resumo da linha do tempo e transcrição) e os textos das outras funções que usam o LLM. Com um modelo que aceita imagens, também quadros do vídeo: no chat, enquanto “Vídeo da timeline anexado” estiver ligado (vem ligado), e na Pontuação Viral.",
	},
	{
		name: "KLIPY (GIFs e stickers)",
		when: "Quando você busca na aba GIFs, com a sua chave. A busca sai direto do navegador.",
		what: "Os termos de busca.",
	},
	{
		name: "Freesound (efeitos sonoros)",
		when: "Quando você busca sons, com a sua chave.",
		what: "Os termos de busca.",
	},
	{
		name: "Wikimedia Commons e Pexels (imagens de banco)",
		when: "Quando você usa “Criar vídeo com IA”. O Wikimedia Commons não pede chave; o Pexels só é usado com a sua chave.",
		what: "Os termos de busca tirados do tema do vídeo.",
	},
	{
		name: "Sarvam AI e Smallest AI (voz, tradução e transcrição)",
		when: "Quando você escolhe um desses motores na Narração, na Dublagem ou nas Legendas, com a sua chave.",
		what: "O texto a ser falado ou traduzido e, na transcrição, o áudio do vídeo.",
	},
	{
		name: "Replicate, Luma e PiAPI (Seedance) (geração de vídeo)",
		when: "Quando você gera um vídeo com um desses provedores, com a sua chave. São serviços pagos.",
		what: "O texto do pedido e a imagem de referência, se houver.",
	},
	{
		name: "Vozes da Microsoft (Edge TTS)",
		when: "Desligado por padrão. Só entra se TTS_EDGE_FALLBACK=true no .env e o serviço de voz local estiver fora do ar.",
		what: "O texto a ser falado.",
	},
	{
		name: "TikTok",
		when: "Quando você conecta a sua conta e publica um vídeo.",
		what: "O vídeo publicado e os dados que você preencher para a publicação.",
	},
	{
		name: "Hugging Face e registro do Ollama",
		when: "Quando um modelo de IA é baixado pela primeira vez.",
		what: "Só o pedido de download; nenhum conteúdo seu.",
	},
];

export default function PrivacyPage() {
	// pt-BR inside an <html lang="en"> root; the brand palette as on the landing
	return (
		<div lang="pt-BR" className="tieia-brand">
			<BasePage
				title="Política de privacidade"
				description="Como a TiêIA trata os seus dados. Última atualização: 1º de novembro de 2026."
			>
				<Accordion type="single" collapsible className="w-full">
					<AccordionItem
						value="quick-summary"
						className="rounded-2xl border px-5"
					>
						<AccordionTrigger className="no-underline!">
							Resumo
						</AccordionTrigger>
						<AccordionContent>
							<h3 className="mb-3 text-lg font-medium">
								Local-first: o trabalho fica no seu computador, e a nuvem é
								opcional.
							</h3>
							<ol className="list-decimal space-y-2 pl-6">
								<li>
									A edição, os projetos e os modelos de IA locais rodam na sua
									máquina.
								</li>
								<li>
									Não existe servidor da TiêIA: quem mantém o projeto não recebe
									os seus vídeos, textos nem dados de uso.
								</li>
								<li>
									Alguns recursos usam serviços na internet. A lista abaixo diz
									quais são, quando entram e o que recebem.
								</li>
								<li>
									Não há conta nem login, e nenhuma ferramenta de analytics vem
									ligada.
								</li>
								<li>Todo o código é aberto e pode ser conferido.</li>
							</ol>
						</AccordionContent>
					</AccordionItem>
				</Accordion>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">Quem trata os seus dados</h2>
					<p>
						A TiêIA é um programa que você roda no seu computador, não um
						serviço on-line. O editor atende só no próprio computador (endereço
						127.0.0.1), e os serviços de IA rodam no Docker da sua máquina. Por
						isso, quem controla os dados é você. Quando você liga um serviço de
						terceiros, ele passa a tratar o que recebe conforme a política de
						privacidade dele.
					</p>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">O que fica na sua máquina</h2>
					<ul className="list-disc space-y-2 pl-6">
						<li>
							Projetos, linha do tempo e mídia importada ficam no armazenamento
							do navegador (IndexedDB e OPFS), ligados ao endereço do editor.
						</li>
						<li>
							Arquivos gerados, como narrações e vozes clonadas, ficam nos
							volumes do Docker.
						</li>
						<li>
							As chaves de API digitadas nas Configurações ficam no
							armazenamento local do navegador. As chaves postas no arquivo .env
							ficam nesse arquivo.
						</li>
						<li>
							Se você conectar o TikTok, o acesso à conta fica num arquivo
							cifrado no seu computador.
						</li>
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">Modelos de IA locais</h2>
					<p>
						Estes rodam na sua máquina, e o que você manda para eles não sai
						dela: transcrição (faster-whisper), voz clonada e narração
						(Chatterbox e Coqui XTTS), tradução (NLLB-200), separação de
						locutores (pyannote), rastreamento de rosto (MediaPipe), pesquisa
						por imagem (CLIP), geração de imagens (diffusers) e LLMs locais pelo
						Ollama ou pelo TurboQuant, que são o padrão.
					</p>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">
						O que pode ir para a internet
					</h2>
					<p>
						Nenhum destes serviços entra sozinho: cada um depende de você usar o
						recurso e, na maioria das vezes, de pôr a sua própria chave.
					</p>
					<ul className="flex flex-col gap-4">
						{CLOUD_SERVICES.map((service) => (
							<li key={service.name} className="border-t pt-3">
								<p className="font-medium">{service.name}</p>
								<p className="text-muted-foreground mt-1">
									<strong className="text-foreground font-medium">
										Quando:
									</strong>{" "}
									{service.when}
								</p>
								<p className="text-muted-foreground mt-1">
									<strong className="text-foreground font-medium">
										O que vai:
									</strong>{" "}
									{service.what}
								</p>
							</li>
						))}
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">
						Compartilhamento e histórico de versões
					</h2>
					<p>
						O código tem links de compartilhamento e sincronização do histórico
						de versões, mas os dois exigem login, e o editor ainda não tem tela
						de login. Quando usados, os links ficam no banco de dados que roda
						no seu Docker. A mídia do histórico só vai para um bucket na
						Cloudflare R2 se você configurar as chaves da R2 no .env.
					</p>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">Analytics</h2>
					<p>
						A TiêIA não manda telemetria para quem mantém o projeto. O código
						traz suporte a Google Analytics e Databuddy, herdado do projeto
						original, mas os dois ficam desligados: só ligam se alguém definir
						NEXT_PUBLIC_GA_MEASUREMENT_ID ou NEXT_PUBLIC_DATABUDDY_CLIENT_ID ao
						montar o editor.
					</p>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">Como apagar os seus dados</h2>
					<ul className="list-disc space-y-2 pl-6">
						<li>
							Projetos e chaves: apague os dados do site do editor nas
							configurações do navegador.
						</li>
						<li>Vozes clonadas: exclua no painel Narração, em Minhas vozes.</li>
						<li>Arquivos gerados: remova os volumes do Docker do projeto.</li>
						<li>
							Conta do TikTok: desconecte pelo editor, o que também apaga o
							acesso salvo.
						</li>
						<li>
							O que já foi enviado a um serviço de terceiros segue a política de
							privacidade dele.
						</li>
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">Código aberto</h2>
					<p>
						Você pode conferir no{" "}
						<a
							href={SOCIAL_LINKS.github}
							target="_blank"
							rel="noopener"
							className="text-primary hover:underline"
						>
							código-fonte no GitHub
						</a>{" "}
						tudo o que esta página descreve. Dúvidas sobre privacidade podem ser
						abertas como issue no repositório.
					</p>
				</section>

				<Separator />
				<p className="text-muted-foreground text-sm">
					Esta política pode mudar junto com o programa. As versões anteriores
					ficam no histórico do repositório.
				</p>
			</BasePage>
		</div>
	);
}
