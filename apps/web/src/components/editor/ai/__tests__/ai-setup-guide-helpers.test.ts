import { describe, expect, test } from "bun:test";
import { formatBytes, statusBadge } from "../ai-setup-guide/helpers";

describe("formatBytes", () => {
	test("picks the unit by size", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(2048)).toBe("2 KB");
		expect(formatBytes(5 * 1_048_576)).toBe("5 MB");
		expect(formatBytes(1_610_612_736)).toBe("1.5 GB");
	});
});

describe("statusBadge", () => {
	test("maps running and loaded to the green badge", () => {
		expect(statusBadge("running")).toEqual({
			variant: "default",
			label: "Em execução",
			dotColor: "bg-green-500",
		});
		expect(statusBadge("loaded").label).toBe("Carregado");
	});

	test("flags stopped, error and not installed as destructive", () => {
		for (const status of ["stopped", "error", "not_installed"] as const) {
			expect(statusBadge(status).variant).toBe("destructive");
		}
	});
});
