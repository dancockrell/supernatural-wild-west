import { writeFileSync, mkdirSync } from "node:fs";
import { simulate } from "../src/engine/simulation";
const result = simulate(
  Number(process.argv[2] || 1000000),
  Number(process.argv[3] || 42),
);
mkdirSync("docs/math", { recursive: true });
writeFileSync(
  `docs/math/${result.configVersion}-${result.seed}-${result.paidSpins}.json`,
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
