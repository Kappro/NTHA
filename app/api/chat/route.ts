import { NextRequest } from "next/server";
import { openai } from "@ai-sdk/openai";
import {convertToModelMessages, stepCountIs, streamText} from "ai";
import { nominatimSearchTool } from "../../../lib/tools/nominatim";
import { Consts } from "../../../lib/consts";
import {tripAdvisorByPlaceTool} from "../../../lib/tools/tripadvisor";

export const runtime = "nodejs";

// System prompt nudges the model toward using the search tool for location queries
const SYSTEM = `You are MapChat.
- For recommendations of hotels/restaurants/attractions near a named place, use "tripAdvisorByPlace".
- For drawing/finding a named area/place on the map, use "nominatimSearch".
After any tool call, summarize briefly.`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({ messages: [] }));
  const { messages, data } = body;

  const result = streamText({
    model: openai(Consts.modelName),
    system: SYSTEM,
    messages: convertToModelMessages(messages),
    // Define server-side tools
    tools: {
      nominatimSearch: nominatimSearchTool,
      tripAdvisorByPlace: tripAdvisorByPlaceTool,
    },
    stopWhen: stepCountIs(5)
  });

  // Return a DATA stream so tool calls + results are forwarded to the client
  return result.toUIMessageStreamResponse();
}
