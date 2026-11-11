import { describe, expect, test } from "bun:test";
import { decodeValue, encodeValue, settle } from "../format";

async function roundTrip(value: unknown) {
	const binaries: Blob[] = [];
	// Through JSON, as the copy is written to disk
	const json = JSON.parse(JSON.stringify(encodeValue(value, binaries)));
	return { result: await settle(decodeValue(json, binaries)), binaries };
}

describe("desktop migration format", () => {
	test("plain data comes back as it was", async () => {
		const value = {
			id: "p1",
			name: "Projeto",
			tracks: [{ n: 1 }, null],
			ok: true,
		};
		expect((await roundTrip(value)).result).toEqual(value);
	});

	test("files keep their bytes, name, type and date", async () => {
		const file = new File(["vídeo"], "clip.mp4", {
			type: "video/mp4",
			lastModified: 1700000000000,
		});
		const { result, binaries } = await roundTrip({ file });
		const back = (result as { file: File }).file;
		expect(binaries).toHaveLength(1);
		expect(back).toBeInstanceOf(File);
		expect(back.name).toBe("clip.mp4");
		expect(back.type).toBe("video/mp4");
		expect(back.lastModified).toBe(1700000000000);
		expect(await back.text()).toBe("vídeo");
	});

	test("blobs, buffers and typed arrays keep their bytes", async () => {
		const value = {
			thumb: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
			buffer: new Uint8Array([4, 5]).buffer,
			samples: new Float32Array([0.5, -0.25]),
		};
		const { result } = await roundTrip(value);
		const back = result as typeof value;
		expect(back.thumb.type).toBe("image/png");
		expect([...new Uint8Array(await back.thumb.arrayBuffer())]).toEqual([
			1, 2, 3,
		]);
		expect([...new Uint8Array(back.buffer)]).toEqual([4, 5]);
		expect(back.samples).toBeInstanceOf(Float32Array);
		expect([...back.samples]).toEqual([0.5, -0.25]);
	});

	test("dates, maps, sets and undefined survive", async () => {
		const value = {
			at: new Date(1700000000000),
			map: new Map<string, unknown>([["a", new Set([1, 2])]]),
			missing: undefined,
		};
		const back = (await roundTrip(value)).result as typeof value;
		expect(back.at).toBeInstanceOf(Date);
		expect(back.at.getTime()).toBe(1700000000000);
		expect(back.map.get("a")).toEqual(new Set([1, 2]));
		expect("missing" in back && back.missing === undefined).toBe(true);
	});

	test("an object that happens to use the tag key is not mistaken for a tag", async () => {
		const value = { __t: "date", v: 5, other: "x" };
		expect((await roundTrip(value)).result).toEqual(value);
	});
});
