/**
 * Byte-budget parsing shared by `check-fonts.mjs` and its tests.
 *
 * `Number("8MB")` is NaN, and every comparison against NaN is false, so an
 * unvalidated `FONT_MAX_*_BYTES` value used to silently disable both budget
 * gates. Reject anything that is not a finite positive byte count instead of
 * passing it through.
 */

/**
 * Parse an environment byte budget, falling back to the configured default.
 *
 * @param {string | undefined} raw
 * @param {number} fallback
 * @param {string} name environment variable name, for the error message
 * @returns {number}
 */
export function parseByteBudget(raw, fallback, name) {
	if (raw === undefined) return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(
			`[fonts:check] invalid ${name}: "${raw}" — must be a positive number of bytes (no units)`,
		);
	}
	return value;
}
