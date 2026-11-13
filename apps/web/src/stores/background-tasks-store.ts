import { create } from "zustand";
import { toast } from "sonner";

export type BackgroundTaskStatus =
	| "running"
	| "completed"
	| "error"
	| "cancelled";

export interface BackgroundTask {
	id: string;
	type:
		| "transcription"
		| "voiceover"
		| "translation"
		| "tts"
		| "clip-finder"
		| "keyword-extraction"
		| "question-cards"
		| "popover-subs"
		| "speaker-diarization"
		| "template-generation"
		| "broll-suggestions"
		| "broll-batch"
		| "smart-cut"
		| "proxy-generation"
		| "dubbing";
	label: string;
	status: BackgroundTaskStatus;
	progress: string;
	startedAt: number;
	completedAt?: number;
	error?: string;
	/**
	 * Stops the work behind the task (aborts its request). A task without one
	 * cannot be interrupted and can only be hidden from the list.
	 */
	cancel?: () => void;
}

interface BackgroundTasksState {
	tasks: BackgroundTask[];
	isMinimized: boolean;

	addTask: (task: Omit<BackgroundTask, "startedAt" | "status">) => void;
	/** Runs the task's cancel function and marks it cancelled. */
	cancelTask: (id: string) => void;
	updateTask: (
		id: string,
		updates: Partial<
			Pick<BackgroundTask, "progress" | "status" | "error" | "completedAt">
		>,
	) => void;
	removeTask: (id: string) => void;
	clearCompleted: () => void;
	setMinimized: (minimized: boolean) => void;
}

export const useBackgroundTasksStore = create<BackgroundTasksState>(
	(set, get) => ({
		tasks: [],
		isMinimized: false,

		addTask: (task) => {
			set((state) => ({
				tasks: [
					...state.tasks,
					{ ...task, status: "running" as const, startedAt: Date.now() },
				],
				isMinimized: false,
			}));
		},

		cancelTask: (id) => {
			const task = get().tasks.find((t) => t.id === id);
			if (!task || task.status !== "running") return;
			// Marked first: the work that fails because it was aborted must not
			// turn the task into an error
			set((state) => ({
				tasks: state.tasks.map((t) =>
					t.id === id
						? { ...t, status: "cancelled" as const, completedAt: Date.now() }
						: t,
				),
			}));
			try {
				task.cancel?.();
			} catch {
				// Nothing more to stop
			}
		},

		updateTask: (id, updates) => {
			// Guard: don't re-notify if task is already in a terminal state
			const existing = get().tasks.find((t) => t.id === id);
			if (!existing) return;
			// A task that finished, failed or was cancelled is done: work that is
			// still unwinding (a request aborted by Cancelar) must not rewrite it
			// or announce a second outcome
			if (
				existing.status === "completed" ||
				existing.status === "error" ||
				existing.status === "cancelled"
			) {
				return;
			}

			set((state) => ({
				tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
			}));

			if (updates.status === "error" && updates.error) {
				toast.error(`${existing.label} falhou`, {
					description: updates.error,
				});
			}

			if (updates.status === "completed") {
				toast.success(`${existing.label} concluída`);
			}
		},

		removeTask: (id) => {
			set((state) => ({
				tasks: state.tasks.filter((t) => t.id !== id),
			}));
		},

		clearCompleted: () => {
			set((state) => ({
				tasks: state.tasks.filter((t) => t.status === "running"),
			}));
		},

		setMinimized: (minimized) => {
			set({ isMinimized: minimized });
		},
	}),
);
