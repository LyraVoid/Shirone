import { expect, test } from "@playwright/test";
import {
	createEncryptedMoment,
	removeEncryptedMoment,
} from "../fixtures/moments-encrypted.mjs";

test.beforeAll(async () => {
	await createEncryptedMoment();
});
test.afterAll(async () => {
	await removeEncryptedMoment();
});

test.describe("encrypted moments", () => {
	test("locked card hides content, teams with tag filters and re-locks", async ({
		page,
	}) => {
		const requests: string[] = [];
		page.on("request", (request) => {
			if (request.url().startsWith("https://api.iconify.design/")) {
				requests.push(request.url());
			}
		});
		const consoleErrors: string[] = [];
		page.on("console", (message) => {
			if (message.type() === "error") consoleErrors.push(message.text());
		});

		await page.goto("/moments/", { waitUntil: "networkidle" });
		await page.waitForFunction(
			() =>
				getComputedStyle(document.documentElement)
					.getPropertyValue("--mc-primary")
					.trim()
					.startsWith("#"),
		);

		const card = page.locator("#moment-zz-encrypted-probe");
		// The fixture is written in beforeAll; Astro dev needs a moment to pick
		// the new content entry up on a cold content store.
		await expect(card).toHaveCount(1, { timeout: 20_000 });
		const gate = card.locator(".password-gate");
		await expect(gate).toBeVisible();
		await expect(card.locator(".moment-card__badge--encrypted")).toBeVisible();
		// Locked card must not render any protected content.
		await expect(card.locator(".moment-card__content")).toHaveCount(0);
		await expect(card.locator(".moment-card__tags .moment-card__tag")).toHaveCount(
			0,
		);
		await expect(card).not.toContainText("Encrypted probe body");
		await expect(card).not.toContainText("Probe location");

		// Incorrect password keeps the gate and reports the error.
		await gate.getByRole("textbox").fill("wrong-password");
		await gate.getByRole("button", { name: "Unlock moment" }).click();
		await expect(gate.getByText("Incorrect password")).toBeVisible();
		await expect(gate).toBeVisible();
		await expect(card.locator(".moment-card__content")).toHaveCount(0);

		// Correct password swaps in the normal card with body, gallery, location and tags.
		await gate.getByRole("textbox").fill("shirone-probe");
		await gate.getByRole("button", { name: "Unlock moment" }).click();
		await expect(gate).toHaveCount(0);
		await expect(card.locator(".moment-card__content")).toContainText(
			"Encrypted probe body",
		);
		await expect(card.locator(".moment-card__location")).toContainText(
			"Probe location",
		);
		await expect(card.locator(".moment-card__tag")).toHaveCount(2);
		await expect(card.locator(".moment-card__tile")).toHaveCount(2);

		// No plaintext survives in session storage: every visit re-locks.
		const sessionKeys = await page.evaluate(() =>
			Object.keys(sessionStorage).filter((key) =>
				key.startsWith("shirone:protected"),
			),
		);
		expect(sessionKeys).toEqual([]);

		await page.reload({ waitUntil: "networkidle" });
		await expect(card.locator(".password-gate")).toBeVisible();

		// The tag filter includes the encrypted moment through public filterTags.
		await page
			.getByRole("button", { name: "probe-public", exact: true })
			.click();
		await expect(page.locator(".moment-card")).toHaveCount(1);
		await expect(card.locator(".password-gate")).toBeVisible();

		// Searching the encrypted body must not match, while public tags still filter.
		await page
			.getByRole("button", { name: "probe-public", exact: true })
			.click();
		const search = page.locator(".moment-section__search input");
		await search.fill("Encrypted probe body");
		await expect(page.locator(".moment-card")).toHaveCount(0);
		await search.fill("");

		expect(consoleErrors).toEqual([]);
		expect(requests).toEqual([]);
	});
});
