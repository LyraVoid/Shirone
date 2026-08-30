/**
 * Runtime bridge for locale modules loaded directly by Node.
 * TypeScript enum syntax is intentionally kept out of this execution path.
 */
const I18nKey = new Proxy(
	{},
	{
		get: (_target, property) => String(property),
	},
);

export default I18nKey;
