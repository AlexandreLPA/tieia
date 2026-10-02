import type { TransitionDefinition } from "./registry";
import { registerTransition } from "./registry";
import crossDissolveShader from "./shaders/cross-dissolve.frag.glsl";
import dipBlackShader from "./shaders/dip-black.frag.glsl";
import slideLeftShader from "./shaders/slide-left.frag.glsl";
import slideRightShader from "./shaders/slide-right.frag.glsl";
import wipeLeftShader from "./shaders/wipe-left.frag.glsl";
import wipeRightShader from "./shaders/wipe-right.frag.glsl";
import zoomShader from "./shaders/zoom.frag.glsl";
import irisWipeShader from "./shaders/iris-wipe.frag.glsl";
import clockWipeShader from "./shaders/clock-wipe.frag.glsl";
import morphShader from "./shaders/morph.frag.glsl";
import glitchShader from "./shaders/glitch.frag.glsl";
import filmBurnShader from "./shaders/film-burn.frag.glsl";
import pagePeelShader from "./shaders/page-peel.frag.glsl";
import spinShader from "./shaders/spin.frag.glsl";
import pushShader from "./shaders/push.frag.glsl";
import fadeWhiteShader from "./shaders/fade-white.frag.glsl";
import checkerboardShader from "./shaders/checkerboard.frag.glsl";
import dissolveZoomShader from "./shaders/dissolve-zoom.frag.glsl";
import bandSlideShader from "./shaders/band-slide.frag.glsl";
import cubeSpinShader from "./shaders/cube-spin.frag.glsl";

const BUILTIN_TRANSITIONS: TransitionDefinition[] = [
	{
		type: "cross-dissolve",
		name: "Dissolver",
		category: "dissolve",
		keywords: [
			"crossfade",
			"dissolve",
			"fade",
			"blend",
			"opacity",
			"esmaecer",
			"suave",
			"mistura",
		],
		defaultDuration: 0.5,
		fragmentShader: crossDissolveShader,
	},
	{
		type: "dip-black",
		name: "Fundo preto",
		category: "dip",
		keywords: ["black", "fade", "dark", "dip", "preto", "escurecer"],
		defaultDuration: 0.75,
		fragmentShader: dipBlackShader,
	},
	{
		type: "slide-left",
		name: "Deslizar ←",
		category: "slide",
		keywords: ["slide", "push", "left", "horizontal", "deslizar", "esquerda"],
		defaultDuration: 0.5,
		fragmentShader: slideLeftShader,
	},
	{
		type: "slide-right",
		name: "Deslizar →",
		category: "slide",
		keywords: ["slide", "push", "right", "horizontal", "deslizar", "direita"],
		defaultDuration: 0.5,
		fragmentShader: slideRightShader,
	},
	{
		type: "wipe-left",
		name: "Varrer ←",
		category: "wipe",
		keywords: ["wipe", "reveal", "left", "edge", "varrer", "esquerda"],
		defaultDuration: 0.5,
		fragmentShader: wipeLeftShader,
	},
	{
		type: "wipe-right",
		name: "Varrer →",
		category: "wipe",
		keywords: ["wipe", "reveal", "right", "edge", "varrer", "direita"],
		defaultDuration: 0.5,
		fragmentShader: wipeRightShader,
	},
	{
		type: "zoom",
		name: "Zoom",
		category: "zoom",
		keywords: ["zoom", "scale", "magnify", "grow", "aproximar", "ampliar"],
		defaultDuration: 0.75,
		fragmentShader: zoomShader,
	},
	{
		type: "iris-wipe",
		name: "Íris",
		category: "iris",
		keywords: [
			"iris",
			"circle",
			"reveal",
			"aperture",
			"star wipe",
			"circulo",
			"abertura",
		],
		defaultDuration: 0.6,
		fragmentShader: irisWipeShader,
	},
	{
		type: "clock-wipe",
		name: "Relógio",
		category: "wipe",
		keywords: ["clock", "radial", "sweep", "angle", "relogio", "ponteiro"],
		defaultDuration: 0.6,
		fragmentShader: clockWipeShader,
	},
	{
		type: "morph",
		name: "Morph",
		category: "morph",
		keywords: [
			"morph",
			"distort",
			"transform",
			"warp",
			"distorcer",
			"transformar",
		],
		defaultDuration: 0.75,
		fragmentShader: morphShader,
	},
	{
		type: "glitch",
		name: "Glitch",
		category: "distortion",
		keywords: [
			"glitch",
			"digital",
			"error",
			"corrupt",
			"pixel",
			"falha",
			"digital",
			"defeito",
		],
		defaultDuration: 0.5,
		fragmentShader: glitchShader,
	},
	{
		type: "film-burn",
		name: "Queima de filme",
		category: "burn",
		keywords: [
			"burn",
			"light",
			"leak",
			"film",
			"fire",
			"heat",
			"queimar",
			"luz",
			"vazamento",
		],
		defaultDuration: 0.8,
		fragmentShader: filmBurnShader,
	},
	{
		type: "page-peel",
		name: "Virar página",
		category: "peel",
		keywords: [
			"page",
			"peel",
			"turn",
			"curl",
			"book",
			"pagina",
			"virar",
			"livro",
		],
		defaultDuration: 0.8,
		fragmentShader: pagePeelShader,
	},
	{
		type: "spin",
		name: "Girar",
		category: "spin",
		keywords: ["spin", "rotate", "turn", "whirl", "girar", "rodar"],
		defaultDuration: 0.75,
		fragmentShader: spinShader,
	},
	{
		type: "push",
		name: "Empurrar",
		category: "slide",
		keywords: ["push", "shove", "slide", "move", "empurrar"],
		defaultDuration: 0.5,
		fragmentShader: pushShader,
	},
	{
		type: "fade-white",
		name: "Flash branco",
		category: "dip",
		keywords: [
			"white",
			"fade",
			"bright",
			"light",
			"flash",
			"branco",
			"clarear",
			"flash",
		],
		defaultDuration: 0.6,
		fragmentShader: fadeWhiteShader,
	},
	{
		type: "checkerboard",
		name: "Xadrez",
		category: "pattern",
		keywords: [
			"checker",
			"grid",
			"pattern",
			"tiles",
			"blocks",
			"xadrez",
			"quadrados",
			"blocos",
		],
		defaultDuration: 0.5,
		fragmentShader: checkerboardShader,
	},
	{
		type: "dissolve-zoom",
		name: "Dissolver com zoom",
		category: "dissolve",
		keywords: ["dissolve", "zoom", "scale", "blend", "esmaecer", "aproximar"],
		defaultDuration: 0.75,
		fragmentShader: dissolveZoomShader,
	},
	{
		type: "band-slide",
		name: "Faixas",
		category: "slide",
		keywords: [
			"band",
			"strip",
			"slide",
			"multi",
			"horizontal",
			"faixas",
			"listras",
		],
		defaultDuration: 0.6,
		fragmentShader: bandSlideShader,
	},
	{
		type: "cube-spin",
		name: "Cubo 3D",
		category: "cube",
		keywords: [
			"cube",
			"3d",
			"spin",
			"rotate",
			"perspective",
			"cubo",
			"girar",
			"3d",
		],
		defaultDuration: 0.75,
		fragmentShader: cubeSpinShader,
	},
];

export function registerDefaultTransitions(): void {
	for (const definition of BUILTIN_TRANSITIONS) {
		registerTransition({ definition });
	}
}
