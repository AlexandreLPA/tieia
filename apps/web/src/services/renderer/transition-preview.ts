import {
	QUAD_POSITIONS,
	compileProgram,
	createTexture,
	setUniforms,
} from "./webgl-utils";

// Rendered at 2x the on-screen thumbnail so it stays sharp on HiDPI
export const PREVIEW_WIDTH = 192;
export const PREVIEW_HEIGHT = 108;

// One loop: hold clip A, run the transition, hold clip B
const HOLD_A_MS = 350;
const TRANSITION_MS = 1100;
const HOLD_B_MS = 550;
const LOOP_MS = HOLD_A_MS + TRANSITION_MS + HOLD_B_MS;

type Target = { canvas: HTMLCanvasElement; fragmentShader: string };

function drawSampleFrame({
	from,
	to,
	label,
}: {
	from: string;
	to: string;
	label: string;
}): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = PREVIEW_WIDTH;
	canvas.height = PREVIEW_HEIGHT;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;

	const gradient = ctx.createLinearGradient(
		0,
		0,
		PREVIEW_WIDTH,
		PREVIEW_HEIGHT,
	);
	gradient.addColorStop(0, from);
	gradient.addColorStop(1, to);
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

	// A shape off-center makes slides, spins and zooms readable
	ctx.fillStyle = "rgba(255,255,255,0.22)";
	ctx.beginPath();
	ctx.arc(PREVIEW_WIDTH * 0.72, PREVIEW_HEIGHT * 0.3, 22, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = "#fff";
	ctx.font = "bold 56px system-ui, sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(label, PREVIEW_WIDTH * 0.4, PREVIEW_HEIGHT * 0.56);
	return canvas;
}

function easeInOut(t: number): number {
	return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function progressAt(now: number): number {
	const t = now % LOOP_MS;
	if (t < HOLD_A_MS) return 0;
	if (t >= HOLD_A_MS + TRANSITION_MS) return 1;
	return easeInOut((t - HOLD_A_MS) / TRANSITION_MS);
}

/**
 * Animated thumbnails for the transition pickers. Every preview runs the
 * transition's real shader on sample clips, through one shared WebGL context
 * (browsers cap how many contexts a page may hold).
 */
class TransitionPreviewer {
	private canvas: HTMLCanvasElement | null = null;
	private gl: WebGLRenderingContext | null = null;
	private programs = new Map<string, WebGLProgram>();
	private textureA: WebGLTexture | null = null;
	private textureB: WebGLTexture | null = null;
	private buffer: WebGLBuffer | null = null;
	private targets = new Set<Target>();
	private frame: number | null = null;
	private failed = false;

	subscribe(target: Target): () => void {
		this.targets.add(target);
		if (this.reducedMotion()) {
			this.draw(target, 0.5);
		} else if (this.frame === null) {
			this.frame = requestAnimationFrame(this.tick);
		}
		return () => {
			this.targets.delete(target);
			if (this.targets.size === 0 && this.frame !== null) {
				cancelAnimationFrame(this.frame);
				this.frame = null;
			}
		};
	}

	private reducedMotion(): boolean {
		return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	}

	private tick = (now: number) => {
		const progress = progressAt(now);
		for (const target of this.targets) this.draw(target, progress);
		this.frame =
			this.targets.size > 0 ? requestAnimationFrame(this.tick) : null;
	};

	private setup(): WebGLRenderingContext | null {
		if (this.gl || this.failed) return this.gl;
		const canvas = document.createElement("canvas");
		canvas.width = PREVIEW_WIDTH;
		canvas.height = PREVIEW_HEIGHT;
		const gl = canvas.getContext("webgl", {
			premultipliedAlpha: false,
			preserveDrawingBuffer: true,
		});
		if (!gl) {
			this.failed = true;
			return null;
		}
		this.canvas = canvas;
		this.gl = gl;
		this.textureA = createTexture({
			context: gl,
			source: drawSampleFrame({ from: "#f97316", to: "#db2777", label: "A" }),
		});
		this.textureB = createTexture({
			context: gl,
			source: drawSampleFrame({ from: "#14b8a6", to: "#4f46e5", label: "B" }),
		});
		this.buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ARRAY_BUFFER, QUAD_POSITIONS, gl.STATIC_DRAW);
		return gl;
	}

	private draw(target: Target, progress: number) {
		const gl = this.setup();
		const output = target.canvas.getContext("2d");
		if (!gl || !this.canvas || !output) return;

		let program: WebGLProgram;
		try {
			program = compileProgram({
				context: gl,
				fragmentShaderSource: target.fragmentShader,
				programCache: this.programs,
			});
		} catch (error) {
			console.warn("Transition preview: shader failed", error);
			this.targets.delete(target);
			return;
		}

		// biome-ignore lint/correctness/useHookAtTopLevel: WebGL call, not a React hook
		gl.useProgram(program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.textureA);
		gl.uniform1i(gl.getUniformLocation(program, "u_textureA"), 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.textureB);
		gl.uniform1i(gl.getUniformLocation(program, "u_textureB"), 1);
		setUniforms({
			context: gl,
			program,
			uniforms: {
				u_progress: progress,
				u_resolution: [PREVIEW_WIDTH, PREVIEW_HEIGHT],
			},
		});

		const position = gl.getAttribLocation(program, "a_position");
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		gl.viewport(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		output.clearRect(0, 0, target.canvas.width, target.canvas.height);
		output.drawImage(
			this.canvas,
			0,
			0,
			target.canvas.width,
			target.canvas.height,
		);
	}
}

export const transitionPreviewer = new TransitionPreviewer();
