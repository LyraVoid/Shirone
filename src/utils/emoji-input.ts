import {
	type EmojiCatalog,
	type EmojiGlyph,
	encodeEmoji,
	findEmoji,
	parseEmojiText,
} from "./emoji-tokens";

/**
 * Emoji input: a contenteditable surface that shows stored emoji as their icons
 * while a source `<textarea>` keeps holding the stored text.
 *
 * The textarea stays the model its widget reads and writes. Edits on the
 * surface are serialised into it through the native value setter plus an
 * `input` event, the same path typing takes, and the widget's own writes
 * (picker inserts, upload placeholders, clearing after submit, edit mode) are
 * observed through an instance-level `value` accessor and re-rendered. Reads of
 * `selectionStart`/`selectionEnd` and calls to `focus()` are answered by the
 * surface, so widget code that inserts at the textarea caret keeps working.
 *
 * `emoji-tokens` decides which spans become icons, so the surface shows exactly
 * what the widget will render: typed or pasted shortcodes turn into icons only
 * where the published comment would show them as images too.
 */

export interface EmojiInputOptions {
	readonly catalog: EmojiCatalog;
	/** Accessible name used when the textarea has no `aria-label` or `title`. */
	readonly label: string;
}

export interface EmojiInput {
	/** The editable surface, placed right after the textarea. */
	readonly element: HTMLElement;
	/** Inserts a catalog emoji at the caret, or where it was before a picker took focus. */
	insert(key: string): boolean;
	/** Removes the surface and hands editing back to the textarea. */
	destroy(): void;
}

interface Piece {
	readonly node: Node;
	readonly kind: "text" | "emoji" | "break";
	readonly start: number;
	readonly end: number;
}

/** The surface serialised to stored text, with each node's span in that text. */
interface Model {
	readonly text: string;
	readonly pieces: readonly Piece[];
}

interface Span {
	readonly start: number;
	readonly end: number;
}

const GLYPH = "emoji-input__glyph";
const NBSP = String.fromCharCode(0xa0);
// Elements that open their own line box; anything else is read as inline.
const BLOCKS = new Set([
	"ADDRESS",
	"ARTICLE",
	"ASIDE",
	"BLOCKQUOTE",
	"DIV",
	"DL",
	"FIGURE",
	"FOOTER",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"HEADER",
	"LI",
	"OL",
	"P",
	"PRE",
	"SECTION",
	"TABLE",
	"TR",
	"UL",
]);
// Stored comments are plain text, so formatting commands never apply.
const RICH_INPUT =
	/^(?:format|insert(?:Link|OrderedList|UnorderedList|HorizontalRule|FromPasteAsQuotation)$)/u;
const HISTORY = new Set(["historyUndo", "historyRedo"]);
const SOURCE_PROPERTIES = ["value", "selectionStart", "selectionEnd", "focus"];
const valueAccessor = Object.getOwnPropertyDescriptor(
	HTMLTextAreaElement.prototype,
	"value",
);

const escapeHtml = (text: string): string =>
	text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const hasFile = (data: DataTransfer): boolean =>
	Array.from(data.items).some((item) => item.kind === "file");

// Without support the drop lands at the current caret instead.
function caretFromPoint(x: number, y: number): [Node, number] | null {
	const position = document.caretPositionFromPoint?.(x, y);
	return position ? [position.offsetNode, position.offset] : null;
}

/** Puts an emoji surface in front of `source`, which keeps the stored text. */
export function attachEmojiInput(
	source: HTMLTextAreaElement,
	{ catalog, label }: EmojiInputOptions,
): EmojiInput {
	const editor = document.createElement("div");
	const lifecycle = new AbortController();
	const listen = { signal: lifecycle.signal };
	let synced = "";
	let saved: Span | null = null;
	let pendingCaret: number | null = null;
	let composing = false;
	let busy = false;

	const readSource = (): string => valueAccessor?.get?.call(source) ?? "";
	const writeSource = (value: string): void =>
		valueAccessor?.set?.call(source, value);
	const focused = (): boolean => document.activeElement === editor;

	const glyphElement = (
		glyph: EmojiGlyph,
		stored?: string,
	): HTMLImageElement => {
		const image = document.createElement("img");
		image.className = GLYPH;
		image.src = glyph.src;
		image.alt = glyph.label;
		image.draggable = false;
		image.decoding = "async";
		image.referrerPolicy = "no-referrer";
		image.dataset.emojiKey = glyph.key;
		if (stored !== undefined) image.dataset.emojiSource = stored;
		return image;
	};

	const glyphOf = (image: HTMLImageElement): EmojiGlyph => {
		const key = image.dataset.emojiKey ?? "";
		const src = image.getAttribute("src") ?? "";
		const known = catalog.get(key);
		return known?.src === src ? known : { key, src, label: image.alt };
	};

	const read = (): Model => {
		const runs: { kind: Piece["kind"]; node: Node }[][] = [[]];
		const visit = (parent: Node): void => {
			for (const node of parent.childNodes) {
				const run = runs[runs.length - 1];
				if (node instanceof Text) run.push({ kind: "text", node });
				else if (node instanceof HTMLBRElement)
					run.push({ kind: "break", node });
				else if (node instanceof HTMLImageElement) {
					if (node.classList.contains(GLYPH)) run.push({ kind: "emoji", node });
				} else if (node instanceof HTMLElement && BLOCKS.has(node.tagName)) {
					runs.push([]);
					visit(node);
					runs.push([]);
				} else visit(node);
			}
		};
		visit(editor);
		let text = "";
		let lines = 0;
		const pieces: Piece[] = [];
		for (const run of runs) {
			const last = run.findLast(
				(item) => item.kind !== "text" || (item.node as Text).data !== "",
			);
			if (!last) continue;
			if (lines++ > 0) text += "\n";
			for (const item of run) {
				const start = text.length;
				if (item.kind === "text") {
					const data = (item.node as Text).data.replaceAll(NBSP, " ");
					// The last line break of a line box is the browser's placeholder:
					// it keeps an empty final line visible but is not content.
					text +=
						item === last && data.endsWith("\n") ? data.slice(0, -1) : data;
				} else if (item.kind === "break") {
					if (item !== last) text += "\n";
				} else {
					const image = item.node as HTMLImageElement;
					text += encodeEmoji(text, glyphOf(image), image.dataset.emojiSource);
				}
				pieces.push({
					node: item.node,
					kind: item.kind,
					start,
					end: text.length,
				});
			}
		}
		return { text, pieces };
	};

	const offsetOf = (model: Model, container: Node, offset: number): number => {
		const range = document.createRange();
		range.setStart(container, offset);
		for (const piece of model.pieces) {
			if (piece.node === container)
				return piece.kind === "text"
					? piece.start + Math.min(offset, piece.end - piece.start)
					: piece.start;
			if (range.comparePoint(piece.node, 0) >= 0) return piece.start;
		}
		return model.text.length;
	};

	const pointOf = (model: Model, offset: number): [Node, number] => {
		for (const piece of model.pieces) {
			if (piece.kind === "text" && offset >= piece.start && offset <= piece.end)
				return [piece.node, offset - piece.start];
			if (offset <= piece.start) {
				const parent = piece.node.parentNode ?? editor;
				return [
					parent,
					Array.prototype.indexOf.call(parent.childNodes, piece.node),
				];
			}
		}
		return [editor, editor.childNodes.length];
	};

	const selected = (model: Model = read()): Span | null => {
		const selection = document.getSelection();
		if (!selection?.rangeCount) return null;
		const range = selection.getRangeAt(0);
		if (
			!editor.contains(range.startContainer) ||
			!editor.contains(range.endContainer)
		)
			return null;
		return {
			start: offsetOf(model, range.startContainer, range.startOffset),
			end: offsetOf(model, range.endContainer, range.endOffset),
		};
	};

	const select = (span: Span, model: Model = read()): void => {
		const start = Math.min(span.start, model.text.length);
		const end = Math.min(span.end, model.text.length);
		const [anchor, anchorOffset] = pointOf(model, start);
		const [focus, focusOffset] = pointOf(model, end);
		document
			.getSelection()
			?.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
	};

	// Where the widget should insert: the live caret, else the one kept on blur.
	const caret = (): Span =>
		selected() ?? saved ?? { start: synced.length, end: synced.length };

	const render = (text: string): void => {
		const fragment = document.createDocumentFragment();
		for (const segment of parseEmojiText(text, catalog))
			fragment.append(
				segment.kind === "text"
					? segment.text
					: glyphElement(segment.glyph, segment.source),
			);
		// The browser only draws an empty final line when a placeholder follows it.
		if (text.endsWith("\n")) fragment.append("\n");
		fragment.normalize();
		editor.replaceChildren(fragment);
		editor.toggleAttribute("data-empty", text === "");
	};

	const sync = (): void => {
		const { text } = read();
		editor.toggleAttribute("data-empty", text === "");
		if (text === readSource()) {
			synced = text;
			return;
		}
		writeSource(text);
		synced = readSource();
		// Events bridged to the textarea stay on it: the widget listens there, and
		// ancestors already saw the surface's own event.
		source.dispatchEvent(new Event("input"));
	};

	// Runs a native editing command so the change joins the undo history.
	// `execCommand` is deprecated without a successor for that; callers fall
	// back to plain DOM edits when it reports failure.
	const edit = (command: string, value?: string): boolean => {
		busy = true;
		try {
			return document.execCommand(command, false, value);
		} finally {
			busy = false;
		}
	};

	const insertHtml = (html: string): void => {
		if (edit("insertHTML", html)) return;
		const selection = document.getSelection();
		const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
		if (!selection || !range || !editor.contains(range.commonAncestorContainer))
			return;
		const fragment = range.createContextualFragment(html);
		const last = fragment.lastChild;
		range.deleteContents();
		range.insertNode(fragment);
		if (last) {
			range.setStartAfter(last);
			range.collapse(true);
			selection.removeAllRanges();
			selection.addRange(range);
		}
	};

	// Turns typed or pasted text that the widget would render as emoji into icons.
	const normalize = (): void => {
		if (!focused()) return;
		let model = read();
		const pending = findEmoji(model.text, catalog).filter((match) =>
			model.pieces.every(
				(piece) =>
					piece.kind === "text" ||
					piece.end <= match.start ||
					piece.start >= match.end,
			),
		);
		if (pending.length === 0) return;
		const restore = selected(model);
		// Right to left, so the offsets of earlier matches stay valid.
		for (const match of pending.reverse()) {
			select(match, model);
			insertHtml(glyphElement(match.glyph, match.source).outerHTML);
			model = read();
		}
		if (restore) select(restore, model);
		sync();
	};

	const settle = (): void => {
		sync();
		normalize();
	};

	// Nothing follows the selection, so a newline inserted last is only visible
	// (and only content) with the browser's placeholder newline after it.
	const atEnd = (): boolean => {
		const selection = document.getSelection();
		if (!selection?.rangeCount) return false;
		const rest = selection.getRangeAt(0).cloneRange();
		rest.setStart(rest.endContainer, rest.endOffset);
		rest.setEnd(editor, editor.childNodes.length);
		const after = rest.cloneContents();
		return (
			after.textContent === "" &&
			!after.querySelector("img") &&
			after.querySelectorAll("br").length < 2
		);
	};

	const insertText = (text: string): void => {
		const value = text.replace(/\r\n?/gu, "\n");
		if (!value) return;
		insertHtml(
			escapeHtml(value.endsWith("\n") && atEnd() ? `${value}\n` : value),
		);
		settle();
	};

	const insertLineBreak = (): void => {
		if (!edit("insertLineBreak")) {
			const at = caret().start;
			insertHtml(atEnd() ? "\n\n" : "\n");
			select({ start: at + 1, end: at + 1 });
		}
		settle();
	};

	// The widget wrote to the textarea itself; show what it wrote.
	const external = (): void => {
		const value = readSource();
		// Mid-composition the IME owns the surface; its result is synced on end.
		if (value === synced || composing) return;
		synced = value;
		const wasFocused = focused();
		render(value);
		if (wasFocused) {
			const at = Math.min(pendingCaret ?? value.length, value.length);
			pendingCaret = null;
			select({ start: at, end: at });
		}
	};

	const moveCaret = (value: unknown): void => {
		pendingCaret = Math.max(0, Math.trunc(Number(value)) || 0);
		// A value write queued before this call renders first and takes the caret.
		queueMicrotask(() => {
			if (pendingCaret === null || !focused() || readSource() !== synced)
				return;
			const at = pendingCaret;
			pendingCaret = null;
			select({ start: at, end: at });
		});
	};

	const focusEditor = (options?: FocusOptions): void => {
		if (focused()) return;
		editor.focus(options);
		if (pendingCaret === null)
			select(saved ?? { start: synced.length, end: synced.length });
	};

	const insert = (key: string): boolean => {
		const glyph = catalog.get(key);
		if (!glyph) return false;
		if (!focused()) {
			editor.focus({ preventScroll: true });
			select(saved ?? { start: synced.length, end: synced.length });
		}
		insertHtml(glyphElement(glyph).outerHTML);
		settle();
		return true;
	};

	const mirror = (): void => {
		const placeholder = source.getAttribute("placeholder") ?? "";
		editor.dataset.placeholder = placeholder;
		if (placeholder) editor.setAttribute("aria-placeholder", placeholder);
		else editor.removeAttribute("aria-placeholder");
		editor.setAttribute(
			"aria-label",
			source.getAttribute("aria-label") || source.title || label,
		);
	};

	editor.className = "emoji-input";
	editor.contentEditable = "true";
	editor.spellcheck = source.spellcheck;
	editor.setAttribute("role", "textbox");
	editor.setAttribute("aria-multiline", "true");
	mirror();
	const attributes = new MutationObserver(mirror);
	attributes.observe(source, {
		attributes: true,
		attributeFilter: ["placeholder", "aria-label", "title"],
	});

	editor.addEventListener(
		"beforeinput",
		(event) => {
			if (busy) return;
			if (RICH_INPUT.test(event.inputType)) event.preventDefault();
			else if (
				event.inputType === "insertParagraph" ||
				event.inputType === "insertLineBreak"
			) {
				event.preventDefault();
				insertLineBreak();
			}
		},
		listen,
	);
	editor.addEventListener(
		"input",
		(event) => {
			sync();
			const { inputType, isComposing } = event as InputEvent;
			if (!busy && !isComposing && !HISTORY.has(inputType)) normalize();
		},
		listen,
	);
	editor.addEventListener(
		"compositionstart",
		() => {
			composing = true;
		},
		listen,
	);
	editor.addEventListener(
		"compositionend",
		() => {
			composing = false;
			settle();
		},
		listen,
	);
	editor.addEventListener(
		"keydown",
		(event) => {
			if (event.isComposing) return;
			// Shortcuts the widget binds on its textarea, such as Ctrl+Enter to submit.
			const forwarded = new KeyboardEvent("keydown", {
				key: event.key,
				code: event.code,
				location: event.location,
				repeat: event.repeat,
				ctrlKey: event.ctrlKey,
				shiftKey: event.shiftKey,
				altKey: event.altKey,
				metaKey: event.metaKey,
				cancelable: true,
			});
			const submit = (event.ctrlKey || event.metaKey) && event.key === "Enter";
			if (!source.dispatchEvent(forwarded) || submit) event.preventDefault();
		},
		listen,
	);
	editor.addEventListener(
		"paste",
		(event) => {
			const data = event.clipboardData;
			if (!data) return;
			event.preventDefault();
			insertText(data.getData("text/plain"));
			// Image files go to the widget's own upload handler, as on the textarea.
			if (hasFile(data))
				source.dispatchEvent(
					new ClipboardEvent("paste", {
						cancelable: true,
						clipboardData: data,
					}),
				);
		},
		listen,
	);
	editor.addEventListener(
		"drop",
		(event) => {
			const data = event.dataTransfer;
			if (!data) return;
			event.preventDefault();
			const point = caretFromPoint(event.clientX, event.clientY);
			editor.focus({ preventScroll: true });
			if (point && editor.contains(point[0]))
				document.getSelection()?.collapse(point[0], point[1]);
			if (hasFile(data))
				source.dispatchEvent(
					new DragEvent("drop", { cancelable: true, dataTransfer: data }),
				);
			else insertText(data.getData("text/plain"));
		},
		listen,
	);
	editor.addEventListener(
		"dragstart",
		(event) => event.preventDefault(),
		listen,
	);
	const exportSelection = (event: ClipboardEvent): boolean => {
		const model = read();
		const span = selected(model);
		if (!span || span.start === span.end || !event.clipboardData) return false;
		event.clipboardData.setData(
			"text/plain",
			model.text.slice(span.start, span.end),
		);
		event.preventDefault();
		return true;
	};
	editor.addEventListener("copy", exportSelection, listen);
	editor.addEventListener(
		"cut",
		(event) => {
			if (!exportSelection(event)) return;
			edit("delete");
			settle();
		},
		listen,
	);
	// Remember the caret while editing, so a picker that takes focus inserts where
	// the writer left off rather than wherever the page selection moved next.
	const remember = (): void => {
		saved = selected() ?? saved;
	};
	document.addEventListener(
		"selectionchange",
		() => {
			if (focused()) remember();
		},
		listen,
	);
	editor.addEventListener("blur", remember, listen);

	synced = readSource();
	render(synced);
	source.after(editor);
	source.hidden = true;
	Object.defineProperties(source, {
		value: {
			configurable: true,
			enumerable: true,
			get: readSource,
			set(value: unknown) {
				writeSource(value == null ? "" : String(value));
				external();
			},
		},
		selectionStart: {
			configurable: true,
			get: () => caret().start,
			set: moveCaret,
		},
		selectionEnd: {
			configurable: true,
			get: () => caret().end,
			set: moveCaret,
		},
		focus: { configurable: true, writable: true, value: focusEditor },
	});

	return {
		element: editor,
		insert,
		destroy() {
			lifecycle.abort();
			attributes.disconnect();
			for (const name of SOURCE_PROPERTIES)
				Reflect.deleteProperty(source, name);
			source.hidden = false;
			editor.remove();
		},
	};
}
