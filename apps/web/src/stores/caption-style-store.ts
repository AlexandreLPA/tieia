import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_CAPTION_STYLE_ID } from "@/lib/captions/caption-styles";

/** The caption look last chosen in the Legendas panel, reused by every
 *  "Adicionar legendas" shortcut so they all produce the same captions. */
interface CaptionStyleState {
	styleId: string;
	wordsPerCaption: number;
	uppercase: boolean;
	setStyleId: (styleId: string) => void;
	setWordsPerCaption: (wordsPerCaption: number) => void;
	setUppercase: (uppercase: boolean) => void;
}

export const useCaptionStyleStore = create<CaptionStyleState>()(
	persist(
		(set) => ({
			styleId: DEFAULT_CAPTION_STYLE_ID,
			wordsPerCaption: 3,
			uppercase: false,
			setStyleId: (styleId) => set({ styleId }),
			setWordsPerCaption: (wordsPerCaption) => set({ wordsPerCaption }),
			setUppercase: (uppercase) => set({ uppercase }),
		}),
		{ name: "opencut:caption-style" },
	),
);
