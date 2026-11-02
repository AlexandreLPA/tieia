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
	"Termos de uso da TiêIA, um editor de vídeo de código aberto (licença MIT) que você roda no seu computador.";

export const metadata: Metadata = {
	title: "Termos de uso - TiêIA",
	description: DESCRIPTION,
	openGraph: {
		title: "Termos de uso - TiêIA",
		description: DESCRIPTION,
		type: "website",
	},
};

const linkClass = "text-primary hover:underline";

export default function TermsPage() {
	// pt-BR inside an <html lang="en"> root; the brand palette as on the landing
	return (
		<div lang="pt-BR" className="tieia-brand">
			<BasePage
				title="Termos de uso"
				description="As regras para usar a TiêIA. Última atualização: 1º de novembro de 2026."
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
								Software livre, sem conta e sem garantia.
							</h3>
							<ol className="list-decimal space-y-2 pl-6">
								<li>
									A TiêIA é gratuita e de código aberto, sob a licença MIT.
								</li>
								<li>
									Ela roda no seu computador. Não há conta, assinatura nem
									serviço on-line.
								</li>
								<li>
									O seu conteúdo é seu. Você responde pelo que cria e publica.
								</li>
								<li>Só clone a voz de quem autorizou.</li>
								<li>
									O programa vem como está, sem garantia. Revise o que a IA
									produz antes de publicar.
								</li>
							</ol>
						</AccordionContent>
					</AccordionItem>
				</Accordion>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">Licença</h2>
					<p>
						A TiêIA é distribuída sob a{" "}
						<a
							href={`${SOCIAL_LINKS.github}/blob/main/LICENSE`}
							target="_blank"
							rel="noopener"
							className={linkClass}
						>
							licença MIT
						</a>
						. Você pode usar, copiar, modificar e distribuir o código, inclusive
						para fins comerciais, desde que mantenha o aviso de copyright e a
						licença. A TiêIA é um fork do OpenCut AI, que por sua vez é um fork
						do OpenCut, ambos também sob a licença MIT.
					</p>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">Sem garantia</h2>
					<p>
						Como diz a licença, o programa é fornecido no estado em que se
						encontra, sem garantia de nenhum tipo. Quem mantém o projeto não
						responde por perda de dados, falhas ou prejuízos que venham do uso.
						Os projetos ficam no armazenamento do navegador: limpar os dados do
						site apaga os projetos, então guarde cópias do que for importante.
					</p>
					<p>
						A IA pode errar. Transcrições, legendas, traduções, vozes geradas,
						respostas do chat e a nota da Pontuação Viral são sugestões. A
						Pontuação Viral confere o vídeo contra regras do TikTok Shop, mas
						não garante que ele será aprovado nem que vai performar bem.
					</p>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">O seu conteúdo</h2>
					<p>
						Os vídeos, áudios, imagens e textos que você usa e cria são seus. A
						TiêIA não reivindica nenhum direito sobre eles. Você é responsável
						por ter permissão para usar o material que importa, como músicas,
						imagens e vídeos de terceiros, e pelo que publica.
					</p>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">Clonagem de voz</h2>
					<p>
						Clone só a sua voz ou a de quem autorizou, e o editor pede essa
						confirmação antes de clonar. Não use vozes clonadas para enganar
						pessoas, se passar por alguém, aplicar golpes ou desrespeitar a lei.
						Se o conteúdo puder confundir quem assiste, avise que a voz foi
						gerada por IA.
					</p>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">Serviços de terceiros</h2>
					<p>
						Alguns recursos usam serviços externos, como OpenRouter, KLIPY,
						Freesound, Sarvam AI, Smallest AI, provedores de geração de vídeo e
						o TikTok. Eles só entram quando você os usa e, na maioria das vezes,
						com a sua própria chave. Ao usá-los, valem os termos e as políticas
						de cada um, e os custos ficam na conta de quem é dono da chave. A
						geração de vídeo é paga, e modelos pagos da OpenRouter ficam
						bloqueados a menos que OPENROUTER_ALLOW_PAID=true no .env. O que é
						enviado a cada serviço está na{" "}
						<a href="/privacy" className={linkClass}>
							política de privacidade
						</a>
						.
					</p>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">Modelos de IA</h2>
					<p>
						Os modelos de IA que a TiêIA baixa não fazem parte do código e têm
						licenças próprias. Alguns limitam o uso comercial, como o Coqui XTTS
						v2. Antes de usar o resultado de um modelo para fins comerciais,
						confira a licença dele.
					</p>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-2xl font-semibold">Contato</h2>
					<p>
						Dúvidas, problemas e sugestões podem ser abertos como issue no{" "}
						<a
							href={SOCIAL_LINKS.github}
							target="_blank"
							rel="noopener"
							className={linkClass}
						>
							repositório no GitHub
						</a>
						.
					</p>
				</section>

				<Separator />
				<p className="text-muted-foreground text-sm">
					Estes termos podem mudar junto com o programa. As versões anteriores
					ficam no histórico do repositório.
				</p>
			</BasePage>
		</div>
	);
}
