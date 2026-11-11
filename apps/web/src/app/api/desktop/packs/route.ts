import { isDesktop } from "@/lib/desktop";
import {
	installPack,
	listPacks,
	packsAvailable,
	startPack,
} from "@/lib/desktop-packs/manager";

export const dynamic = "force-dynamic";

function unavailable() {
	if (isDesktop && packsAvailable()) return null;
	return new Response("Not found", { status: 404 });
}

/** The packs and how each one is: not installed, installing, installed. */
export async function GET() {
	return unavailable() ?? Response.json({ packs: listPacks() });
}

/** { action: "install" | "start", id } */
export async function POST(request: Request) {
	const missing = unavailable();
	if (missing) return missing;
	const body = (await request.json().catch(() => ({}))) as {
		action?: string;
		id?: string;
	};
	if (!body.id) return new Response("Missing id", { status: 400 });
	try {
		if (body.action === "install") installPack(body.id);
		else if (body.action === "start") await startPack(body.id);
		else return new Response("Unknown action", { status: 400 });
	} catch (error) {
		return new Response(error instanceof Error ? error.message : "Erro", {
			status: 400,
		});
	}
	return Response.json({ packs: listPacks() });
}
