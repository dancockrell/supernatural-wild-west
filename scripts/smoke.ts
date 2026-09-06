export {};
const base = process.argv[2] || "http://127.0.0.1:8787";
const response = await fetch(base + "/api/session");
const cookie = response.headers.get("set-cookie")!.split(";")[0];
let { state } = await response.json();
for (let i = 0; i < 12 || state.phase === "bonus"; i++) {
  const request = {
    requestId: crypto.randomUUID(),
    expectedSequence: state.sequence,
    bet: 100,
  };
  const r = await fetch(base + "/api/spin", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(result));
  state = result.state;
}
const recovery = await (
  await fetch(base + "/api/session", { headers: { cookie } })
).json();
if (JSON.stringify(recovery.state) !== JSON.stringify(state))
  throw new Error("Recovery mismatch");
console.log(
  `Secure RNG HTTP smoke: ${state.sequence} rounds settled and recovered; ${state.configVersion}.`,
);
