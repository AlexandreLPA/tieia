"""TikTok Shop compliance check: video frames + transcript through the active vision model.

The rules are embedded here on purpose — the container can't see the affiliate's
instruction file. Image support is never faked: when the active model can't take
images the check is refused (see model_backend.VisionUnsupportedError).
"""

import base64
import binascii
import logging
import math
import re
import unicodedata
from typing import Any, NamedTuple

from app.services.model_backend import VisionUnsupportedError, _parse_json_response, llm_backend

logger = logging.getLogger(__name__)

MAX_FRAMES = 16
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_TRANSCRIPT_CHARS = 12_000
MAX_AD_INFO_CHARS = 2000
MAX_ITEMS_PER_CATEGORY = 15

CATEGORY_IDS = ("claims", "minors", "watermark", "product_ad")

TIKTOK_SHOP_RULES = """\
REGRAS DE COMPLIANCE DO TIKTOK SHOP (obrigatórias — violação derruba o vídeo e a conta):
1. NUNCA alegar resultado físico ou de saúde. PALAVRAS PROIBIDAS: emagrece, emagrecer, queima/queimar gordura, perda de peso, reduzir medidas, reduzir barriga, celulite, estrias, flacidez, clarear/clareamento, iluminar a pele, tratar, curar, prevenir, proteger do sol/UV/SPF, efeito lipo, remover gordura, desinchar como tratamento, "tira" qualquer coisa do corpo, comparação com procedimento estético. Também é proibido: antes e depois de corpo, prometer "bumbum empinado em X dias", produtos milagrosos, "médico recomenda".
2. SUBSTITUIÇÕES SEGURAS: em vez de "afina a cintura" diga "modela a silhueta na hora"; em vez de "reduz a barriga" diga "dá aquele contorno e segurança na medida certa"; "tira celulite" NUNCA deve ser dito — o certo é falar de "tecido que não marca, toque suave". O foco é no que o produto É (compressão confortável, elastano, costura invisível, tecido respirável) e no que a criadora SENTE ("me sinto mais confiante, gosto do caimento"). Emoção e autoestima são permitidas; promessa de mudança corporal é proibida.
3. Produtos de saúde/beleza (cosméticos, protetor solar, suplementos) seguem as mesmas regras restritas: apenas descrição sensorial (textura, cheiro, sensação na pele, como usar), zero promessas. Produtos terapêuticos, como protetor solar e suplementos, são restritos.
4. Nunca criar depoimento falso nem inventar avaliações; nunca se passar por outra pessoa.
5. Proibido: imagens/screenshots de página de produto como vídeo, conteúdo copiado de outros criadores, ofensas, menores de idade no conteúdo, marcas alheias ("igual à marca X"), preços inventados, urgência falsa extrema ("compre antes que eu morra"), prometer que o produto rende dinheiro.
"""

SYSTEM_PROMPT = (
    """\
Você é um revisor de conformidade do TikTok Shop Brasil. Recebe quadros extraídos de um vídeo (em ordem de tempo), a transcrição e, se houver, os dados do anúncio. Aponte o que pode derrubar o vídeo ou a conta da afiliada @sionara40mais (moda modeladora feminina, público de mulheres 40+).

"""
    + TIKTOK_SHOP_RULES
    + """
REGRAS ADICIONAIS:
(a) PREÇO x QUANTIDADE: nunca dizer "N pelo preço de 1" ("3 pelo preço de 1", "leve 3 pague 1", "São 10 pelo preço de uma") se o preço padrão do anúncio não for o do kit com N unidades. Isso vale mesmo que a frase pareça um gancho comum.
(b) FIDELIDADE DO PRODUTO: quantidade, cor e itens mostrados ou falados no vídeo devem bater com o anúncio.
Sem os dados do anúncio não dá para provar (a) nem (b): aponte só o que o vídeo afirma ou mostra e precisa ser conferido com o anúncio, sempre como "atencao", nunca "risco". A regra 5 (screenshot de página de produto como vídeo, marca alheia, preço inventado) continua valendo sem os dados do anúncio.

CATEGORIAS (use exatamente estes ids):
- "claims" (alegações): fala e texto na tela. Procure palavras proibidas da regra 1, promessas de resultado corporal ou de saúde, trechos que pedem a substituição segura da regra 2 (sugira a substituição), marcas alheias, preço inventado, urgência falsa, depoimento ou avaliação falsa, se passar por outra pessoa, ofensas, prometer que o produto rende dinheiro. Termos de sensação/bem-estar (massagear, destressar, relaxar) são "atencao", nunca "risco", a menos que prometam tratamento ou resultado. "Relax" descrevendo o caimento da roupa (ex.: relaxed fit) não é problema.
- "minors": sinalize apenas quem APARENTA ser menor de idade nos quadros, ou fala/texto que indique um menor no conteúdo. Se não há pessoas visíveis, não devolva nenhum item. Dúvida real = "atencao". Nunca identifique ninguém: descreva só a situação (ex.: "criança aparente ao fundo").
- "watermark": logotipo ou @usuário de outra plataforma ou de outro criador (TikTok de terceiros, Kwai, Instagram, YouTube Shorts, CapCut etc.) indica conteúdo reaproveitado = "risco". A marca d'água do TikTok muda de canto durante o vídeo e termina com um cartão com o @usuário: olhe TODOS os quadros, inclusive os últimos. Se o @ for @sionara40mais, use "atencao" (o vídeo é dela, mas foi baixado com marca d'água: baixe sem marca d'água). Se houver marca d'água do TikTok mas o @ não estiver legível, use "atencao" e peça para conferir de quem é.
- "product_ad" (produto x anúncio): regras (a) e (b), screenshot ou print de página de produto usado como vídeo (regra 5) e produto restrito da regra 3 (cosméticos, protetor solar, suplementos).

NÍVEIS: "atencao" = zona cinzenta ou ponto que a criadora precisa conferir; "risco" = violação clara.

COMO RESPONDER:
- Só reporte o que você realmente vê nos quadros ou lê na transcrição. Não invente achados; categoria sem problemas devolve "items": [].
- Cada achado deve citar onde está: em "evidence", o trecho falado exato ou o que aparece na imagem, indicando o quadro (ex.: "Quadro 3, t=9.0s"); em "time", o tempo em segundos (número) ou null se não der para saber.
- Escreva tudo em português do Brasil.
- Formato: um único objeto JSON, exatamente assim:
{"summary": "1 ou 2 frases sobre o que foi verificado e o resultado geral", "categories": {"claims": {"items": [{"level": "atencao ou risco", "text": "o que foi encontrado", "evidence": "trecho ou quadro", "time": 12.3, "suggestion": "como corrigir, com a substituição segura quando houver"}]}, "minors": {"items": []}, "watermark": {"items": []}, "product_ad": {"items": []}}}
"""
)

_DATA_URI_RE = re.compile(r"data:image/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})")

_LEVELS = {
    "risco": "risco", "risk": "risco", "alto": "risco", "alta": "risco", "high": "risco",
    "grave": "risco", "critico": "risco", "critical": "risco", "violacao": "risco",
    "violation": "risco", "proibido": "risco", "vermelho": "risco", "red": "risco",
    "atencao": "atencao", "attention": "atencao", "aviso": "atencao", "warning": "atencao",
    "warn": "atencao", "medio": "atencao", "media": "atencao", "medium": "atencao",
    "moderado": "atencao", "cuidado": "atencao", "caution": "atencao", "duvida": "atencao",
    "amarelo": "atencao", "yellow": "atencao",
}


class ScanTerm(NamedTuple):
    stems: tuple[str, ...]  # accent-free, lowercase word prefixes
    note: str
    suggestion: str


# Deterministic transcript scan, independent of the model. Not violations — wellness
# wording that reviewers flag — so they only ever produce "atencao".
SCAN_TERMS: tuple[ScanTerm, ...] = (
    ScanTerm(
        ("massag",),
        "Termo de sensação/bem-estar na fala (massagem/massagear). Não é violação por si só, mas evite sugerir tratamento ou resultado no corpo.",
        "Descreva a sensação do tecido no uso (conforto, toque suave) sem prometer efeito.",
    ),
    ScanTerm(
        ("destress", "desestress"),
        "Termo de sensação/bem-estar na fala (destressar). Não é violação por si só, mas evite sugerir tratamento ou resultado.",
        "Fale do que você sente ao usar (confiança, conforto) em vez de prometer alívio de estresse.",
    ),
    ScanTerm(
        ("relax",),
        "Termo de bem-estar na fala (relaxar/relaxante). Se descreve o caimento da roupa (ex.: relaxed fit) não é problema; confira o contexto.",
        "Se o sentido for de bem-estar, troque por uma descrição do conforto do tecido.",
    ),
)


def validate_image_data_uri(value: str) -> str:
    """Return value if it's a base64 jpeg/png/webp data URI within the size cap, else raise ValueError."""
    match = _DATA_URI_RE.fullmatch(value)
    if not match:
        raise ValueError(
            "A imagem deve ser um data URI base64 (jpeg, png ou webp); links http(s) não são aceitos."
        )
    payload = match.group(1)
    if len(payload) * 3 // 4 - payload.count("=") > MAX_IMAGE_BYTES:
        raise ValueError("Imagem grande demais (máximo de 2 MB por quadro).")
    try:
        base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Imagem base64 inválida.") from exc
    return value


def _fold(text: str) -> str:
    """Lowercase and strip accents so 'destressa' and 'destréssa' compare equal."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def normalize_level(value: Any) -> str | None:
    """Map the model's level wording ('atenção', 'attention', 'risk'...) to atencao/risco."""
    if not isinstance(value, str):
        return None
    return _LEVELS.get(re.sub(r"[^a-z]", "", _fold(value)))


def _normalize_time(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = value.strip().rstrip("sS").replace(",", ".")
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        return None
    return round(seconds, 1) if math.isfinite(seconds) and seconds >= 0 else None


def _clean_text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _normalize_item(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    level = normalize_level(raw.get("level"))
    text = _clean_text(raw.get("text"), 500)
    if level is None or not text:
        return None
    return {
        "level": level,
        "text": text,
        "evidence": _clean_text(raw.get("evidence"), 500),
        "time": _normalize_time(raw.get("time")),
        "suggestion": _clean_text(raw.get("suggestion"), 500),
        "source": "modelo",
    }


def normalize_result(parsed: dict[str, Any]) -> tuple[str, dict[str, list[dict[str, Any]]]]:
    """Validate the model's JSON: keep known categories and well-formed items only."""
    summary = _clean_text(parsed.get("summary"), 1000)
    raw_categories = parsed.get("categories")
    by_id = (
        {re.sub(r"[^a-z_]", "", _fold(str(k))): v for k, v in raw_categories.items()}
        if isinstance(raw_categories, dict)
        else {}
    )

    categories: dict[str, list[dict[str, Any]]] = {}
    dropped = 0
    for category_id in CATEGORY_IDS:
        block = by_id.get(category_id)
        raw_items = block.get("items") if isinstance(block, dict) else block
        if not isinstance(raw_items, list):
            raw_items = []
        items = [item for item in map(_normalize_item, raw_items) if item is not None]
        dropped += len(raw_items) - len(items)
        categories[category_id] = items[:MAX_ITEMS_PER_CATEGORY]
    if dropped:
        logger.warning("TikTok compliance: dropped %d malformed item(s) from the model output", dropped)
    return summary, categories


def scan_transcript(
    segments: list[dict[str, Any]], model_claims: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Wellness-wording findings from the transcript, skipping stems the model already cited."""
    cited = [_fold(f"{item['text']} {item['evidence']}") for item in model_claims]
    findings: list[dict[str, Any]] = []
    for term in SCAN_TERMS:
        if any(stem in text for text in cited for stem in term.stems):
            continue
        for segment in segments:
            words = str(segment.get("text", "")).split()
            for index, word in enumerate(words):
                normalized = re.sub(r"[^a-z0-9]", "", _fold(word))
                if any(normalized.startswith(stem) for stem in term.stems):
                    excerpt = " ".join(words[max(0, index - 3) : index + 4])
                    findings.append(
                        {
                            "level": "atencao",
                            "text": term.note,
                            "evidence": f"“{excerpt}”",
                            "time": _normalize_time(segment.get("start")),
                            "suggestion": term.suggestion,
                            "source": "varredura",
                        }
                    )
                    break
    return findings


def _category_status(items: list[dict[str, Any]]) -> str:
    levels = {item["level"] for item in items}
    return "risco" if "risco" in levels else "atencao" if "atencao" in levels else "ok"


def _transcript_block(segments: list[dict[str, Any]]) -> str:
    if not segments:
        return (
            "TRANSCRIÇÃO: não disponível (o vídeo pode não ter falas ou não foi transcrito). "
            "Analise só as imagens e diga isso no resumo."
        )
    lines: list[str] = []
    total = 0
    for segment in segments:
        line = f"[{float(segment['start']):.1f}-{float(segment['end']):.1f}] {segment['text'].strip()}"
        if total + len(line) > MAX_TRANSCRIPT_CHARS:
            lines.append("[transcrição truncada]")
            break
        lines.append(line)
        total += len(line) + 1
    return "TRANSCRIÇÃO (com tempos em segundos):\n" + "\n".join(lines)


def build_messages(
    frames: list[dict[str, Any]], segments: list[dict[str, Any]], ad_info: str
) -> list[dict[str, Any]]:
    """System rules + one user message: frames (label then image), transcript, ad data, final instruction."""
    ordered = sorted(frames, key=lambda f: f["time"])
    content: list[dict[str, Any]] = [
        {"type": "text", "text": f"Seguem {len(ordered)} quadros do vídeo, em ordem de tempo."}
    ]
    for index, frame in enumerate(ordered, start=1):
        content.append({"type": "text", "text": f"Quadro {index} — t={frame['time']:.1f}s"})
        content.append({"type": "image_url", "image_url": {"url": frame["image"]}})

    if ad_info.strip():
        ad_block = f"DADOS DO ANÚNCIO (informados pela afiliada):\n{ad_info.strip()}"
    else:
        ad_block = (
            "DADOS DO ANÚNCIO: NÃO informados. Aplique as regras (a) e (b) só como "
            '"atencao" sobre o que o vídeo afirma ou mostra.'
        )
    content.append(
        {
            "type": "text",
            "text": (
                f"{_transcript_block(segments)}\n\n{ad_block}\n\n"
                "Verifique as 4 categorias e responda somente com o JSON pedido, "
                "sem markdown e sem texto fora do JSON."
            ),
        }
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": content},
    ]


async def check_tiktok_compliance(
    frames: list[dict[str, Any]], transcript: list[dict[str, Any]], ad_info: str
) -> dict[str, Any]:
    """Run the check on the active model. Refusals come back as a result, real failures raise."""
    support = await llm_backend.vision_support()
    llm = {"backend": support["backend"], "model": support["model"], "cloud": support["cloud"]}
    if not support["ok"]:
        return {"refused": True, "reason": support["reason"], "llm": llm}

    segments = [s for s in transcript if str(s.get("text", "")).strip()]
    messages = build_messages(frames, segments, ad_info)
    try:
        raw = await llm_backend.chat_vision(messages)
    except VisionUnsupportedError as exc:
        return {"refused": True, "reason": str(exc), "llm": llm}

    try:
        parsed = _parse_json_response(raw)
    except ValueError as exc:
        raise RuntimeError(
            "O modelo não devolveu um JSON válido. Tente de novo ou troque de modelo."
        ) from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("O modelo não devolveu um objeto JSON. Tente de novo ou troque de modelo.")

    summary, model_items = normalize_result(parsed)
    model_items["claims"] += scan_transcript(segments, model_items["claims"])
    categories = {
        category_id: {"status": _category_status(items), "items": items}
        for category_id, items in model_items.items()
    }
    return {
        "refused": False,
        "llm": llm,
        "summary": summary,
        "categories": categories,
        "frames_analyzed": len(frames),
        "transcript_used": bool(segments),
        "ad_info_used": bool(ad_info.strip()),
    }
