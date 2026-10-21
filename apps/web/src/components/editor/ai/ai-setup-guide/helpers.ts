export type ServiceState = "running" | "stopped" | "loaded" | "available" | "not_installed" | "loading" | "error";

export interface OllamaModel {
	name: string;
	size: number;
	modified_at: string;
}


export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
	return `${(bytes / 1024).toFixed(0)} KB`;
}

export function statusBadge(status: ServiceState): {
	variant: "default" | "secondary" | "destructive" | "outline";
	label: string;
	dotColor: string;
} {
	switch (status) {
		case "running":
		case "loaded":
			return { variant: "default", label: status === "loaded" ? "Carregado" : "Em execução", dotColor: "bg-green-500" };
		case "available":
			return { variant: "secondary", label: "Não carregado", dotColor: "bg-yellow-500" };
		case "not_installed":
			return { variant: "destructive", label: "Não instalado", dotColor: "bg-red-500" };
		case "loading":
			return { variant: "outline", label: "Carregando...", dotColor: "bg-yellow-500" };
		case "stopped":
			return { variant: "destructive", label: "Parado", dotColor: "bg-red-500" };
		case "error":
			return { variant: "destructive", label: "Erro", dotColor: "bg-red-500" };
	}
}
