import { AutopilotClient } from "./autopilot";

export { AIClientError } from "./core";
export type * from "./types";

/**
 * Client for the AI backend (services/ai-backend).
 *
 * Each file in this folder adds the methods of one area and extends the
 * previous one: core -> analysis -> image -> speech -> llm -> providers -> setup -> templates -> turboquant -> video -> youtube -> search -> autopilot.
 * A new method goes in the file of its area; a new area becomes a new file
 * inserted in that chain.
 */
class AIClient extends AutopilotClient {}

export const aiClient = new AIClient();
