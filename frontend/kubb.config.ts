import path from "node:path";
import { createConfig } from "@hyoretsu/kubb/config";

export default createConfig({
	config: {
		api: {
			clientImportPath: "@/lib/api/client-api",
			jsonPath: path.resolve(import.meta.dirname, "../backend/out/openapi.json"),
			name: "api",
		},
	},
	dateType: "string",
	exclude: [{ pattern: "External", type: "tag" }],
});
