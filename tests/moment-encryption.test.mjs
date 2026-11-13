import assert from "node:assert/strict";
import test from "node:test";
import { isEncryptedMoment } from "../src/utils/moment-encryption.ts";
import {
	decryptProtectedContent,
	encryptProtectedContent,
	ProtectedContentError,
} from "../src/utils/password-protection.ts";

const SECRET = JSON.stringify({
	html: "<p>secret body</p>",
	location: "secret place",
	mood: "material-symbols:lock-outline-rounded",
	tags: ["secret-tag"],
	images: [{ src: "/secret.png", alt: "secret image" }],
});

test("moment encryption follows the fail-closed password contract", () => {
	assert.equal(isEncryptedMoment({}), false);
	assert.equal(isEncryptedMoment({ encrypted: false }), false);
	assert.equal(isEncryptedMoment({ password: "swordfish" }), true);
	assert.equal(isEncryptedMoment({ password: 123456 }), true);
	assert.equal(
		isEncryptedMoment({ encrypted: true, password: "swordfish" }),
		true,
	);

	for (const data of [
		{ encrypted: true },
		{ encrypted: true, password: "" },
		{ encrypted: true, password: "   " },
	]) {
		assert.throws(
			() => isEncryptedMoment(data),
			/Encrypted moments require a non-empty password/,
			JSON.stringify(data),
		);
	}
});

test("moment payloads round-trip without exposing plaintext", async () => {
	const payload = await encryptProtectedContent(
		SECRET,
		"swordfish",
		"moment:probe",
		"application/json",
	);

	const serialized = JSON.stringify(payload);
	assert.doesNotMatch(serialized, /secret body|secret place|secret-tag/);
	assert.equal(payload.contentType, "application/json");
	assert.equal(payload.scope, "moment:probe");

	assert.equal(
		await decryptProtectedContent(payload, "swordfish", "moment:probe"),
		SECRET,
	);
	await assert.rejects(
		() => decryptProtectedContent(payload, "wrong", "moment:probe"),
		ProtectedContentError,
	);
	await assert.rejects(
		() => decryptProtectedContent(payload, "swordfish", "moment:other"),
		ProtectedContentError,
	);
});
