import type { KeybindingConfig } from "@/types/keybinding";

interface V5State {
	keybindings: KeybindingConfig;
	isCustomized: boolean;
}

/** Adds the Clipchamp-style group shortcuts unless those keys are taken. */
export function v5ToV6({ state }: { state: unknown }): unknown {
	const v5 = state as V5State;
	const keybindings = { ...v5.keybindings };

	if (!keybindings["ctrl+g"]) {
		keybindings["ctrl+g"] = "group-selected";
	}
	if (!keybindings["ctrl+shift+g"]) {
		keybindings["ctrl+shift+g"] = "ungroup-selected";
	}

	return { ...v5, keybindings };
}
