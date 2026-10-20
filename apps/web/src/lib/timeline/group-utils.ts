import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { generateUUID } from "@/utils/id";

type ElementRef = { trackId: string; elementId: string };

/**
 * Adds every element that shares a groupId with one of the given elements,
 * so grouped items are always selected, moved and duplicated together.
 * Keeps the original order and appends the other group members after it.
 */
export function expandRefsToGroups({
	tracks,
	elements,
}: {
	tracks: TimelineTrack[];
	elements: ElementRef[];
}): ElementRef[] {
	if (elements.length === 0) return elements;

	const groupIds = new Set<string>();
	for (const { trackId, elementId } of elements) {
		const element = tracks
			.find((track) => track.id === trackId)
			?.elements.find((trackElement) => trackElement.id === elementId);
		if (element?.groupId) groupIds.add(element.groupId);
	}
	if (groupIds.size === 0) return elements;

	const seen = new Set(elements.map(refKey));
	const expanded = [...elements];
	for (const track of tracks) {
		for (const element of track.elements) {
			if (!element.groupId || !groupIds.has(element.groupId)) continue;
			const ref = { trackId: track.id, elementId: element.id };
			if (seen.has(refKey(ref))) continue;
			seen.add(refKey(ref));
			expanded.push(ref);
		}
	}
	return expanded;
}

export function getGroupMembers({
	tracks,
	groupId,
}: {
	tracks: TimelineTrack[];
	groupId: string;
}): { track: TimelineTrack; element: TimelineElement }[] {
	const members: { track: TimelineTrack; element: TimelineElement }[] = [];
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.groupId === groupId) members.push({ track, element });
		}
	}
	return members;
}

/**
 * Copies of grouped elements (duplicate, paste, the right half of a split)
 * form a new group instead of joining the original one. Returns a function
 * that maps each original groupId to the same fresh id.
 */
export function createGroupIdRemapper(): (
	groupId: string | undefined,
) => string | undefined {
	const remapped = new Map<string, string>();
	return (groupId) => {
		if (!groupId) return undefined;
		let next = remapped.get(groupId);
		if (!next) {
			next = generateUUID();
			remapped.set(groupId, next);
		}
		return next;
	};
}

function refKey({ trackId, elementId }: ElementRef): string {
	return `${trackId}:${elementId}`;
}
