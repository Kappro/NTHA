import { NextRequest } from "next/server";
import { openai } from "@ai-sdk/openai";
import {convertToModelMessages, stepCountIs, streamText} from "ai";
import { nominatimSearchTool } from "../../../lib/tools/nominatim";
import { foursquareByPlaceTool } from "../../../lib/tools/foursquare-by-place";

export const runtime = "nodejs";

// System prompt nudges the model toward using the correct search tool for the respective query
const SYSTEM = `You are MapChat.
- If the user wants only to find a location, use only "nominatimSearch".
- If prompted by the user for recommendations of hotels/restaurants/attractions near a named place, use only "foursquareByPlace". After using this tool, you can remind the user that they can click on the markers for more details.
After any tool call, summarize briefly.`;

// Sends API requests to OpenAI through the server-side instead of client-side.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({ messages: [] }));
  const { messages, data } = body;

  const result = streamText({
    model: openai(process.env.OPENAI_MODEL_NAME ?? "gpt-4.1-nano"),
    system: SYSTEM,
    messages: convertToModelMessages(messages),
    // Define server-side tools
    tools: {
      nominatimSearch: nominatimSearchTool,
      foursquareByPlace: foursquareByPlaceTool,
    },
    stopWhen: stepCountIs(5)
  });

  // Return a UI Message stream so tool calls + results are forwarded to the client
  return result.toUIMessageStreamResponse();
}
