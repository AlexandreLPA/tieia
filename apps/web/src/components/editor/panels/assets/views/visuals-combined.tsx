"use client";

import { SubTabView } from "./sub-tab-view";
import { EffectsView } from "./effects";
import { FiltersView } from "./filters";
import { AdjustmentView } from "./adjustment";
import { TransitionsView } from "./transitions";

export function VisualsCombinedView() {
	return (
		<SubTabView
			tab="visuals"
			tabs={[
				{
					key: "transitions",
					label: "Transições",
					content: <TransitionsView />,
				},
				{ key: "effects", label: "Efeitos", content: <EffectsView /> },
				{ key: "filters", label: "Filtros", content: <FiltersView /> },
				{ key: "adjustment", label: "Ajustes", content: <AdjustmentView /> },
			]}
		/>
	);
}
