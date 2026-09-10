import { BrowserDemo } from './browser-demo';
import type {
  RgsAdapter,
  GameState,
  SpinResult,
  SpinRequest,
} from "../engine/types";
export class RgsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
/**
 * Every failure leaves here already worded for a player.
 *
 * main.ts prints `${e.message}. Reconnect to recover this round safely.` into
 * the status line, so whatever text reaches it is read by whoever is playing.
 * Two of the three ways a round can fail were handing it browser-authored
 * strings: a dropped connection produced "Failed to fetch. Reconnect to
 * recover this round safely." and the 12s timeout produced "signal timed out.
 * Reconnect to recover this round safely." The 500 path only read well because
 * the server happens to supply its own wording. A body that is not JSON - an
 * HTML error page from something in front of the server - would have printed a
 * parser message the same way.
 *
 * So the transport failures are caught here rather than being cleaned up at
 * the point of display: this is the one place that knows which kind of failure
 * it was, and a `status` of 0 keeps them distinguishable from anything the
 * server actually answered.
 */
async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/" + path, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
    throw new RgsError(
      timedOut ? "The table did not answer in time" : "Lost the connection to the table",
      0,
    );
  }
  const data = await response.json().catch(() => undefined);
  if (!response.ok)
    throw new RgsError(
      data?.error || `The table refused the round (${response.status})`,
      response.status,
    );
  if (data === undefined)
    throw new RgsError("The table sent a reply that could not be read", 0);
  return data;
}
export class DemoRgsAdapter implements RgsAdapter {
  private browser = import.meta.env.MODE === "public-demo" ? new BrowserDemo() : undefined;
  async connect() {
    return (await this.reconnect()).state;
  }
  spin(r: SpinRequest) {
    return this.browser ? this.browser.spin(r) : request<SpinResult>("spin", r);
  }
  reconnect() {
    if(this.browser)return this.browser.reconnect();
    return request<{ state: GameState; lastResult: SpinResult | null }>(
      "session",
    );
  }
  history() {
    return this.browser ? this.browser.history() : request<SpinResult[]>("history");
  }
}
