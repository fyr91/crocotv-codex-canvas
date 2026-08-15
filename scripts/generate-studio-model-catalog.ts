import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getStudioModelCatalog } from "../server/model-catalog";

const target = path.resolve("studio/src/generated/modelCatalog.json");
await writeFile(target, `${JSON.stringify(getStudioModelCatalog(), null, 2)}\n`);
console.log(`Generated ${target}`);
