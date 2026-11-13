import { beforeEach, describe, expect, test } from "bun:test";
import { useBackgroundTasksStore } from "../background-tasks-store";

const store = () => useBackgroundTasksStore.getState();
const task = (id: string) => store().tasks.find((t) => t.id === id);

function add(id: string, cancel?: () => void) {
	store().addTask({
		id,
		type: "transcription",
		label: "Transcrição (Whisper)",
		progress: "Iniciando...",
		cancel,
	});
}

beforeEach(() => {
	useBackgroundTasksStore.setState({ tasks: [], isMinimized: false });
});

describe("background tasks", () => {
	test("a new task is running", () => {
		add("a");
		expect(task("a")?.status).toBe("running");
	});

	test("cancelling runs the task's cancel function and marks it cancelled", () => {
		let aborted = 0;
		add("a", () => {
			aborted += 1;
		});
		store().cancelTask("a");
		expect(aborted).toBe(1);
		expect(task("a")?.status).toBe("cancelled");
		expect(task("a")?.completedAt).toBeGreaterThan(0);
	});

	test("the work that fails because it was aborted does not turn the task into an error", () => {
		add("a", () => {
			// What aborting does in the app: the request fails, and the code that
			// started it reports the failure on the task
			store().updateTask("a", { status: "error", error: "aborted" });
		});
		store().cancelTask("a");
		expect(task("a")?.status).toBe("cancelled");
		expect(task("a")?.error).toBeUndefined();
	});

	test("cancelling a task that is already finished does nothing", () => {
		let aborted = 0;
		add("a", () => {
			aborted += 1;
		});
		store().updateTask("a", { status: "completed", completedAt: 1 });
		store().cancelTask("a");
		expect(aborted).toBe(0);
		expect(task("a")?.status).toBe("completed");
	});

	test("a cancel function that throws still leaves the task cancelled", () => {
		add("a", () => {
			throw new Error("nothing to stop");
		});
		expect(() => store().cancelTask("a")).not.toThrow();
		expect(task("a")?.status).toBe("cancelled");
	});

	test("a task without a cancel function can still be hidden", () => {
		add("a");
		store().removeTask("a");
		expect(task("a")).toBeUndefined();
	});

	test("clearing finished tasks keeps the ones still running", () => {
		add("running");
		add("done");
		add("cancelled", () => {});
		store().updateTask("done", { status: "completed" });
		store().cancelTask("cancelled");
		store().clearCompleted();
		expect(store().tasks.map((t) => t.id)).toEqual(["running"]);
	});

	test("an error closes a running task", () => {
		add("a");
		store().updateTask("a", {
			status: "error",
			error: "Nenhuma fala detectada",
			completedAt: 5,
		});
		expect(task("a")?.status).toBe("error");
		expect(task("a")?.error).toBe("Nenhuma fala detectada");
	});
});
