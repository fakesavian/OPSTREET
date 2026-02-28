/**
 * Thin Bob MCP client.
 * Connects to the OPNet Instructor MCP server at https://ai.opnet.org/mcp
 * via JSON-RPC over HTTP with SSE responses.
 *
 * SAFETY: Never pass secrets, private keys, or seed phrases to this client.
 * All calls are to testnet-only operations.
 */

const BOB_URL = "https://ai.opnet.org/mcp";

interface McpToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface SseMessage {
  event?: string;
  data?: string;
}

/** Parse Server-Sent Events text into messages */
function parseSse(raw: string): SseMessage[] {
  const messages: SseMessage[] = [];
  let current: SseMessage = {};
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      current.event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      current.data = line.slice(5).trim();
    } else if (line === "" && (current.event ?? current.data)) {
      messages.push(current);
      current = {};
    }
  }
  if (current.event ?? current.data) messages.push(current);
  return messages;
}

export class BobClient {
  private sessionId: string | null = null;
  private msgId = 1;

  async init(): Promise<void> {
    const res = await fetch(BOB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.msgId++,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "opfun-api", version: "0.1.0" },
        },
      }),
    });

    // Session ID comes back in response header
    this.sessionId = res.headers.get("mcp-session-id") ?? res.headers.get("Mcp-Session-Id");

    if (!this.sessionId) {
      // Try to read from SSE body
      const text = await res.text();
      for (const msg of parseSse(text)) {
        if (msg.data) {
          const d = JSON.parse(msg.data) as { result?: { sessionId?: string } };
          if (d.result?.sessionId) {
            this.sessionId = d.result.sessionId;
            break;
          }
        }
      }
    }

    // Send initialized notification
    if (this.sessionId) {
      await fetch(BOB_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Mcp-Session-Id": this.sessionId,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
      }).catch(() => undefined);
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    if (!this.sessionId) await this.init();

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    const res = await fetch(BOB_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.msgId++,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

    const text = await res.text();
    for (const msg of parseSse(text)) {
      if (msg.data && msg.data !== "") {
        try {
          const d = JSON.parse(msg.data) as {
            result?: McpToolResult;
            error?: { message: string };
          };
          if (d.result) return d.result;
          if (d.error) throw new Error(`Bob error: ${d.error.message}`);
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
    throw new Error("No result from Bob MCP tool call");
  }

  /** Extract text content from a tool result */
  static text(result: McpToolResult): string {
    return result.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text ?? "")
      .join("\n");
  }
}

/** Singleton for API use */
let _bob: BobClient | null = null;
export function getBob(): BobClient {
  if (!_bob) _bob = new BobClient();
  return _bob;
}
