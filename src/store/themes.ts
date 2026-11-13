/**
 * The custom-theme STORE (theme wave, 2026-11-04): `<id>.json` files under
 * config.themesDir() behind the core ThemeStore port. Files are re-validated
 * on read (a hand-edited or truncated file is skipped, never thrown), and
 * ids follow the slug grammar so a crafted id cannot leave the directory.
 */

import fs from "node:fs";
import path from "node:path";
import { themesDir } from "../../config.ts";
import { removeLeftoverTemps, writeFileAtomicSync } from "./atomic-write.ts";
import type { ThemeStore } from "../core/ports.ts";
import { isBuiltinThemeId, isThemeId, sanitizeThemeFile, type Theme, type ThemeFile } from "../core/themes.ts";

function fileFor(id: string): string {
	return path.join(/* turbopackIgnore: true */ themesDir(), `${id}.json`);
}

function read(id: string): Theme | null {
	if (!isThemeId(id) || isBuiltinThemeId(id)) return null;
	try {
		const theme = sanitizeThemeFile(JSON.parse(fs.readFileSync(fileFor(id), "utf-8")));
		return theme ? { ...theme, id, builtin: false } : null;
	} catch {
		return null;
	}
}

/** The disk ThemeStore: one `<id>.json` per imported theme under themesDir();
 *  unreadable or invalid files are skipped, never thrown. */
export const themeStore: ThemeStore = {
	listThemes(): Theme[] {
		let names: string[];
		try {
			names = fs.readdirSync(themesDir());
		} catch {
			return []; // no dir yet = no custom themes
		}
		return names
			.filter((n) => n.endsWith(".json"))
			.map((n) => read(n.slice(0, -".json".length)))
			.filter((t): t is Theme => t !== null)
			.sort((a, b) => a.id.localeCompare(b.id));
	},

	readTheme: read,

	writeTheme(id: string, theme: ThemeFile): void {
		if (!isThemeId(id) || isBuiltinThemeId(id)) throw new Error(`Invalid custom theme id "${id}"`);
		fs.mkdirSync(themesDir(), { recursive: true });
		const file: ThemeFile = { name: theme.name, mode: theme.mode, colors: theme.colors };
		writeFileAtomicSync(fileFor(id), `${JSON.stringify(file, null, "\t")}\n`);
	},

	deleteTheme(id: string): void {
		if (!isThemeId(id) || isBuiltinThemeId(id)) return;
		fs.rmSync(fileFor(id), { force: true });
		removeLeftoverTemps(fileFor(id));
	},
};
