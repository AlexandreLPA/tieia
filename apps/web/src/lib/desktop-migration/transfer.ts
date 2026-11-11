import {
	blobFileName,
	type DatabaseSnapshot,
	decodeValue,
	encodeValue,
	MIGRATION_API,
	type MigrationManifest,
	opfsFileName,
	settle,
	type StoreSnapshot,
} from "./format";

export interface Progress {
	/** What is being done, in the words shown on screen */
	label: string;
	done: number;
	total: number;
}

type OnProgress = (progress: Progress) => void;

// ----- IndexedDB -----

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function openDatabase(
	name: string,
	version?: number,
	upgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(name, version);
		req.onupgradeneeded = () => upgrade?.(req.result);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		req.onblocked = () =>
			reject(new Error(`O banco ${name} está aberto em outra aba do editor.`));
	});
}

async function readDatabase(
	name: string,
	binaries: Blob[],
): Promise<DatabaseSnapshot> {
	const db = await openDatabase(name);
	try {
		const stores: StoreSnapshot[] = [];
		for (const storeName of Array.from(db.objectStoreNames)) {
			const store = db
				.transaction(storeName, "readonly")
				.objectStore(storeName);
			const [values, keys] = await Promise.all([
				request(store.getAll()),
				request(store.getAllKeys()),
			]);
			stores.push({
				name: storeName,
				keyPath: store.keyPath,
				autoIncrement: store.autoIncrement,
				indexes: Array.from(store.indexNames).map((indexName) => {
					const index = store.index(indexName);
					return {
						name: indexName,
						keyPath: index.keyPath,
						unique: index.unique,
						multiEntry: index.multiEntry,
					};
				}),
				records: values.map((value, i) => ({
					key: store.keyPath === null ? encodeValue(keys[i], binaries) : null,
					value: encodeValue(value, binaries),
				})),
			});
		}
		return { name, version: db.version, stores };
	} finally {
		db.close();
	}
}

/** Puts the records into the app's database of that name, adding what it lacks. */
async function writeDatabase(snapshot: DatabaseSnapshot, binaries: Blob[]) {
	const createMissing = (db: IDBDatabase, tx: IDBTransaction | null) => {
		for (const store of snapshot.stores) {
			const target = db.objectStoreNames.contains(store.name)
				? tx?.objectStore(store.name)
				: db.createObjectStore(store.name, {
						keyPath: store.keyPath ?? undefined,
						autoIncrement: store.autoIncrement,
					});
			if (!target) continue;
			for (const index of store.indexes) {
				if (!target.indexNames.contains(index.name)) {
					target.createIndex(index.name, index.keyPath, {
						unique: index.unique,
						multiEntry: index.multiEntry,
					});
				}
			}
		}
	};

	// Open at the snapshot's version or the app's own, whichever is newer,
	// and add any store the app's copy does not have yet
	let db = await openDatabase(snapshot.name, undefined, (fresh) =>
		createMissing(fresh, null),
	);
	const missing = snapshot.stores.some(
		(store) => !db.objectStoreNames.contains(store.name),
	);
	if (missing || db.version < snapshot.version) {
		const version = Math.max(db.version + 1, snapshot.version);
		db.close();
		db = await new Promise<IDBDatabase>((resolve, reject) => {
			const req = indexedDB.open(snapshot.name, version);
			req.onupgradeneeded = () => createMissing(req.result, req.transaction);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}

	try {
		for (const store of snapshot.stores) {
			const records = await Promise.all(
				store.records.map(async (record) => ({
					key: await settle(decodeValue(record.key, binaries)),
					value: await settle(decodeValue(record.value, binaries)),
				})),
			);
			const tx = db.transaction(store.name, "readwrite");
			const target = tx.objectStore(store.name);
			for (const record of records) {
				if (target.keyPath === null)
					target.put(record.value, record.key as IDBValidKey);
				else target.put(record.value);
			}
			await new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
		}
	} finally {
		db.close();
	}
}

// ----- OPFS -----

type DirectoryHandle = FileSystemDirectoryHandle & {
	values(): AsyncIterable<FileSystemHandle>;
};

async function listFiles(
	directory: FileSystemDirectoryHandle,
	prefix = "",
): Promise<{ path: string; file: File }[]> {
	const out: { path: string; file: File }[] = [];
	for await (const handle of (directory as DirectoryHandle).values()) {
		const path = prefix ? `${prefix}/${handle.name}` : handle.name;
		if (handle.kind === "file") {
			out.push({
				path,
				file: await (handle as FileSystemFileHandle).getFile(),
			});
		} else {
			out.push(...(await listFiles(handle as FileSystemDirectoryHandle, path)));
		}
	}
	return out;
}

async function fileHandleAt(path: string): Promise<FileSystemFileHandle> {
	const parts = path.split("/");
	let directory = await navigator.storage.getDirectory();
	for (const part of parts.slice(0, -1)) {
		directory = await directory.getDirectoryHandle(part, { create: true });
	}
	return directory.getFileHandle(parts[parts.length - 1], { create: true });
}

// ----- Server -----

async function check(response: Response, what: string) {
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`${what} (${response.status}) ${text}`.trim());
	}
	return response;
}

function fileUrl(name: string) {
	return `${MIGRATION_API}/file?name=${encodeURIComponent(name)}`;
}

// ----- Export: runs in the browser that has the projects -----

/**
 * Sends everything the editor keeps in this browser to the desktop app's
 * server, which saves it to disk until the app reads it. Nothing here is
 * removed: the browser keeps its copy.
 */
export async function exportBrowserStorage(onProgress: OnProgress) {
	onProgress({ label: "Lendo os projetos", done: 0, total: 1 });
	const binaries: Blob[] = [];
	const databases: DatabaseSnapshot[] = [];
	for (const info of await indexedDB.databases()) {
		if (!info.name) continue;
		databases.push(await readDatabase(info.name, binaries));
	}
	const localStorageCopy: Record<string, string> = {};
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key !== null) localStorageCopy[key] = localStorage.getItem(key) ?? "";
	}
	const files = await listFiles(await navigator.storage.getDirectory());

	await check(
		await fetch(MIGRATION_API, { method: "DELETE" }),
		"Falha ao preparar a cópia",
	);

	const uploads = [
		...files.map((entry) => ({
			name: opfsFileName(entry.path),
			body: entry.file as Blob,
		})),
		...binaries.map((blob, i) => ({ name: blobFileName(i), body: blob })),
	];
	const total = uploads.reduce((sum, upload) => sum + upload.body.size, 0);
	let done = 0;
	for (const upload of uploads) {
		onProgress({ label: "Copiando vídeos e imagens", done, total });
		await check(
			await fetch(fileUrl(upload.name), { method: "PUT", body: upload.body }),
			`Falha ao copiar ${upload.name}`,
		);
		done += upload.body.size;
	}

	const manifest: MigrationManifest = {
		format: 1,
		createdAt: new Date().toISOString(),
		localStorage: localStorageCopy,
		databases,
		files: files.map((entry) => ({
			path: entry.path,
			size: entry.file.size,
			type: entry.file.type,
			lastModified: entry.file.lastModified,
		})),
		blobs: binaries.map((blob) => ({ size: blob.size, type: blob.type })),
	};
	// Written last: the app takes a copy only once its manifest is there
	await check(
		await fetch(MIGRATION_API, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(manifest),
		}),
		"Falha ao concluir a cópia",
	);
	onProgress({ label: "Pronto", done: total, total });
	return {
		projects: countProjects(manifest),
		files: files.length,
		bytes: total,
	};
}

/** The projects in a copy (the records of the projects database). */
export function countProjects(manifest: MigrationManifest) {
	const projects = manifest.databases.find(
		(db) => db.name === "video-editor-projects",
	);
	return (
		projects?.stores.reduce((sum, store) => sum + store.records.length, 0) ?? 0
	);
}

// ----- Import: runs in the desktop app -----

/** The copy waiting on disk, if there is one. */
export async function pendingCopy(): Promise<MigrationManifest | null> {
	const response = await fetch(MIGRATION_API, { cache: "no-store" });
	if (response.status === 404) return null;
	await check(response, "Falha ao ler a cópia");
	return (await response.json()) as MigrationManifest;
}

/** Writes a copy into this app's storage, then removes it from disk. */
export async function importCopy(
	manifest: MigrationManifest,
	onProgress: OnProgress,
) {
	const total =
		manifest.files.reduce((sum, file) => sum + file.size, 0) +
		manifest.blobs.reduce((sum, blob) => sum + blob.size, 0);
	let done = 0;

	for (const file of manifest.files) {
		onProgress({ label: "Trazendo vídeos e imagens", done, total });
		const response = await check(
			await fetch(fileUrl(opfsFileName(file.path)), { cache: "no-store" }),
			`Falha ao ler ${file.path}`,
		);
		const writable = await (await fileHandleAt(file.path)).createWritable();
		if (response.body) await response.body.pipeTo(writable);
		else await writable.close();
		done += file.size;
	}

	const binaries: Blob[] = [];
	for (let i = 0; i < manifest.blobs.length; i++) {
		const response = await check(
			await fetch(fileUrl(blobFileName(i)), { cache: "no-store" }),
			"Falha ao ler um arquivo da cópia",
		);
		binaries.push(await response.blob());
		done += manifest.blobs[i].size;
		onProgress({ label: "Trazendo vídeos e imagens", done, total });
	}

	onProgress({ label: "Gravando os projetos", done: total, total });
	for (const database of manifest.databases) {
		await writeDatabase(database, binaries);
	}
	for (const [key, value] of Object.entries(manifest.localStorage)) {
		localStorage.setItem(key, value);
	}

	await check(
		await fetch(MIGRATION_API, { method: "DELETE" }),
		"Falha ao limpar a cópia",
	);
	onProgress({ label: "Pronto", done: total, total });
}
