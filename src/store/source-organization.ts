import fs from "node:fs";
import path from "node:path";
import { sourceOrganizationFile } from "../../config.ts";
import { emptySourceOrganization, parseSourceOrganization } from "../core/source-organization.ts";
import type { SourceOrganizationStore } from "../core/ports.ts";
import { emit } from "../core/events.ts";
import { assertGraphFormat, ensureGraphFormat } from "./graph-format.ts";
import { removeLeftoverTemps, writeFileAtomicSync } from "./atomic-write.ts";

export const sourceOrganizationStore: SourceOrganizationStore = {
	read() {
		assertGraphFormat();
		let raw: string;
		try { raw = fs.readFileSync(sourceOrganizationFile(), "utf8"); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptySourceOrganization();
			throw error;
		}
		return parseSourceOrganization(JSON.parse(raw));
	},
	write(state) {
		assertGraphFormat();
		const valid = parseSourceOrganization(state);
		fs.mkdirSync(path.dirname(sourceOrganizationFile()), { recursive: true });
		ensureGraphFormat();
		writeFileAtomicSync(sourceOrganizationFile(), JSON.stringify(valid, null, "\t") + "\n");
		removeLeftoverTemps(sourceOrganizationFile()); // crash leftovers could still place deleted sources
		emit("sources-changed", {});
	},
};
