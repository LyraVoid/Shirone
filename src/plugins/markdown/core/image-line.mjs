export function isImageOnOwnLine(children, index) {
	const before = children[index - 1];
	const after = children[index + 1];
	return (
		(!before ||
			(before.type === "text" &&
				(/\n[ \t]*$/.test(before.value) ||
					(index === 1 && /^[ \t]*$/.test(before.value))))) &&
		(!after ||
			(after.type === "text" &&
				(/^[ \t]*\n/.test(after.value) ||
					(index === children.length - 2 && /^[ \t]*$/.test(after.value)))))
	);
}
