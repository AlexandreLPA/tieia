import { useEffect, useRef, useState } from "react";
import { THINKING_MESSAGES } from "./constants";

export function useThinkingMessage(isThinking: boolean) {
	const [index, setIndex] = useState(() => Math.floor(Math.random() * THINKING_MESSAGES.length));

	useEffect(() => {
		if (!isThinking) return;
		// Pick a random starting message each time thinking begins
		setIndex(Math.floor(Math.random() * THINKING_MESSAGES.length));

		const interval = setInterval(() => {
			setIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
		}, 3000);

		return () => clearInterval(interval);
	}, [isThinking]);

	return THINKING_MESSAGES[index];
}

/**
 * Tab rows wider than the panel scroll sideways: the mouse wheel moves them,
 * the edges fade where tabs are hidden and the active tab stays in view.
 */
export function useScrollableTabs(activeKey: string) {
	const ref = useRef<HTMLDivElement>(null);
	const [edges, setEdges] = useState({ left: false, right: false });

	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const update = () => {
			const max = element.scrollWidth - element.clientWidth;
			setEdges({
				left: element.scrollLeft > 1,
				right: element.scrollLeft < max - 1,
			});
		};
		const onWheel = (event: WheelEvent) => {
			// Trackpads already scroll sideways; only vertical wheels are turned
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
			if (element.scrollWidth <= element.clientWidth) return;
			event.preventDefault();
			element.scrollLeft += event.deltaY;
		};
		update();
		element.addEventListener("scroll", update, { passive: true });
		element.addEventListener("wheel", onWheel, { passive: false });
		const observer = new ResizeObserver(update);
		observer.observe(element);
		if (element.firstElementChild) observer.observe(element.firstElementChild);
		return () => {
			element.removeEventListener("scroll", update);
			element.removeEventListener("wheel", onWheel);
			observer.disconnect();
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: activeKey is the trigger; the active tab is read from the DOM
	useEffect(() => {
		const element = ref.current;
		const active = element?.querySelector<HTMLElement>('[data-active="true"]');
		if (!element || !active) return;
		const box = element.getBoundingClientRect();
		const tab = active.getBoundingClientRect();
		const margin = 24;
		if (tab.left < box.left + margin) {
			element.scrollBy({ left: tab.left - box.left - margin, behavior: "smooth" });
		} else if (tab.right > box.right - margin) {
			element.scrollBy({ left: tab.right - box.right + margin, behavior: "smooth" });
		}
	}, [activeKey]);

	const overflowing = edges.left || edges.right;
	const fade = 20;
	const maskImage = overflowing
		? `linear-gradient(to right, ${edges.left ? `transparent, #000 ${fade}px` : "#000"}, ${
				edges.right ? `#000 calc(100% - ${fade}px), transparent` : "#000"
			})`
		: undefined;

	return { ref, overflowing, style: { maskImage, WebkitMaskImage: maskImage } };
}
