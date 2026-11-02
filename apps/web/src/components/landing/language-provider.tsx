"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
	DEFAULT_LANDING_LANGUAGE,
	LANDING_COPY,
	type LandingLanguage,
	htmlLangFor,
	readStoredLanguage,
	storeLanguage,
} from "./i18n";

interface LandingLanguageValue {
	language: LandingLanguage;
	setLanguage: (language: LandingLanguage) => void;
}

const LandingLanguageContext = createContext<LandingLanguageValue | null>(null);

/**
 * Wraps the landing page: holds the language picked in the header, keeps it
 * in localStorage and sets `lang` on the wrapper and on <html> while the
 * landing is open. The server renders Portuguese; a stored choice applies
 * once the page mounts.
 */
export function LandingLanguageProvider({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	const [language, setLanguageState] = useState<LandingLanguage>(
		DEFAULT_LANDING_LANGUAGE,
	);

	useEffect(() => {
		setLanguageState(readStoredLanguage());
	}, []);

	useEffect(() => {
		const root = document.documentElement;
		const previous = root.lang;
		root.lang = htmlLangFor(language);
		return () => {
			root.lang = previous;
		};
	}, [language]);

	const setLanguage = (next: LandingLanguage) => {
		setLanguageState(next);
		storeLanguage(next);
	};

	return (
		<LandingLanguageContext.Provider value={{ language, setLanguage }}>
			<div lang={htmlLangFor(language)} className={className}>
				{children}
			</div>
		</LandingLanguageContext.Provider>
	);
}

/** The language picker's state, or null outside the landing. */
export function useLandingLanguage() {
	return useContext(LandingLanguageContext);
}

/** The landing copy in the picked language; Portuguese outside the landing. */
export function useLandingCopy() {
	const value = useContext(LandingLanguageContext);
	return LANDING_COPY[value?.language ?? DEFAULT_LANDING_LANGUAGE];
}
