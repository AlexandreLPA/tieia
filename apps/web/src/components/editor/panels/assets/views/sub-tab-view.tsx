"use client";

import { useState } from "react";
import { type Tab, useAssetsPanelStore } from "@/stores/assets-panel-store";
import { cn } from "@/utils/ui";

interface SubTab {
	key: string;
	label: string;
	content: React.ReactNode;
}

/**
 * A view with sub-tabs inside a single sidebar panel.
 * Used to consolidate related features under one sidebar icon.
 * With `tab`, the open sub-tab lives in the assets panel store, so other
 * parts of the app (the AI chat's "Mostrar") can open one.
 */
export function SubTabView({
	tabs,
	defaultTab,
	tab,
}: {
	tabs: SubTab[];
	defaultTab?: string;
	tab?: Tab;
}) {
	const [localActive, setLocalActive] = useState(defaultTab ?? tabs[0]?.key ?? "");
	const storedActive = useAssetsPanelStore((s) => (tab ? s.subTabs[tab] : undefined));
	const setSubTab = useAssetsPanelStore((s) => s.setSubTab);
	const active = storedActive ?? localActive;
	const current = tabs.find((t) => t.key === active) ?? tabs[0];

	const select = (key: string) => {
		setLocalActive(key);
		if (tab) setSubTab(tab, key);
	};

	return (
		<div className="flex flex-col h-full">
			{/* Sub-tab bar */}
			<div className="flex border-b border-border shrink-0">
				{tabs.map((subTab) => (
					<button
						key={subTab.key}
						type="button"
						data-ui-target={tab ? `${tab}/${subTab.key}` : undefined}
						onClick={() => select(subTab.key)}
						className={cn(
							"flex-1 px-2 py-2 text-[11px] font-medium transition-colors border-b-2",
							current?.key === subTab.key
								? "border-primary text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						{subTab.label}
					</button>
				))}
			</div>
			{/* Content */}
			<div className="flex-1 min-h-0 overflow-hidden">
				{current?.content}
			</div>
		</div>
	);
}
