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
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new RgsError(
      data.error || `Server error ${response.status}`,
      response.status,
    );
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
