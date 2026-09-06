import { simulate } from "../engine/simulation";
self.onmessage = (e: MessageEvent<{ spins: number; seed: number }>) => {
  try {
    self.postMessage({ result: simulate(e.data.spins, e.data.seed) });
  } catch (e) {
    self.postMessage({ error: (e as Error).message });
  }
};
