"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateBranchDialog({
	isOpen,
	onOpenChange,
	onConfirm,
	currentBranch,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (name: string, description?: string) => void;
	currentBranch: string;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState("");

	const handleOpenChange = (open: boolean) => {
		if (open) {
			setName("");
			setDescription("");
			setError("");
		}
		onOpenChange(open);
	};

	const validate = (value: string): string => {
		if (!value.trim()) return "O nome da ramificação é obrigatório";
		if (!/^[a-zA-Z0-9][a-zA-Z0-9\-_]*$/.test(value)) {
			return "Deve começar com letra/número; use apenas letras, números, hífens e sublinhados";
		}
		return "";
	};

	const handleSubmit = () => {
		const err = validate(name);
		if (err) {
			setError(err);
			return;
		}
		onConfirm(name.trim(), description.trim() || undefined);
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Nova ramificação</DialogTitle>
				</DialogHeader>

				<DialogBody className="gap-3">
					<div className="text-xs text-muted-foreground">
						Criando ramificação a partir de <span className="font-medium text-foreground">{currentBranch}</span>
					</div>

					<div>
						<Label htmlFor="branch-name">Nome da ramificação</Label>
						<Input
							id="branch-name"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								setError("");
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleSubmit();
								}
							}}
							placeholder="ex.: corte-social, cliente-v2"
							className="mt-1"
							autoFocus
						/>
						{error && (
							<div className="text-xs text-destructive mt-1">{error}</div>
						)}
					</div>

					<div>
						<Label htmlFor="branch-desc" className="text-xs text-muted-foreground">
							Descrição (opcional)
						</Label>
						<Input
							id="branch-desc"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Para que serve esta ramificação?"
							className="mt-1"
						/>
					</div>
				</DialogBody>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button onClick={handleSubmit}>Criar ramificação</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
