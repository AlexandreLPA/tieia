/**
 * Scenes and tracks made before the editor spoke Portuguese carry their
 * default name in English inside the saved project. They are shown translated;
 * a name the user typed is never touched.
 */
const LEGACY_DEFAULTS: Record<string, string> = {
	"Main scene": "Cena principal",
	"Main Track": "Trilha principal",
};

export function displayDefaultName(name: string): string {
	return LEGACY_DEFAULTS[name] ?? name;
}
