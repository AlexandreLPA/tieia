"use client";

import { PanelView } from "@/components/editor/panels/assets/views/base-view";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/editor/panels/properties/section";
import { FactCheckView } from "./factcheck";

import { ProjectInfoContent } from "./settings/project-info";
import { ProxyEditingSection } from "./settings/proxy-editing";
import { AIOptimizationSection } from "./settings/ai-optimization";
import { APIKeysSection } from "./settings/api-keys";

export function SettingsView() {
	return (
		<PanelView contentClassName="px-0" hideHeader>
			<div className="flex flex-col">
				<Section showTopBorder={false}>
					<SectionContent>
						<ProjectInfoContent />
					</SectionContent>
				</Section>
				<Section>
					<SectionHeader>
						<SectionTitle>Edição por proxy</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<ProxyEditingSection />
					</SectionContent>
				</Section>
				<Section>
					<SectionHeader>
						<SectionTitle>Otimização de IA</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<AIOptimizationSection />
					</SectionContent>
				</Section>
				<Section>
					<SectionHeader>
						<SectionTitle>Chaves de API</SectionTitle>
					</SectionHeader>
					<SectionContent>
						<APIKeysSection />
					</SectionContent>
				</Section>
				{/* Fact Check renders its own PanelView header */}
				<FactCheckView />
				</div>
		</PanelView>
	);
}

