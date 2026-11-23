import { type APIRequestContext, expect, test } from "@playwright/test";
import {
	createEncryptedMoment,
	removeEncryptedMoment,
	touchEncryptedMoment,
} from "../fixtures/moments-encrypted.mjs";

async function isServed(request: APIRequestContext) {
	const response = await request.get("/moments/");
	return (
		response.ok() &&
		(await response.text()).includes('id="moment-zz-encrypted-probe"')
	);
}

// The fixture is written while the dev server is running, and the test used to
// open /moments/ straight away. Two things then went wrong now and then:
// - If the server compiles /moments/ for the first time while it is syncing
//   the new entry, it keeps serving the page without the entry until the
//   content changes again.
// - The server tells connected browsers to reload once after the sync. A page
//   rendered before the sync whose HMR socket connects after that message
//   stays stale.
// No wait inside the test can recover from either. So render the page once
// before the fixture exists, then wait until the server itself serves the
// entry, and write the file again if it does not.
test.beforeAll(async ({ request }) => {
	test.setTimeout(120_000);
	await request.get("/moments/");
	await createEncryptedMoment();
	for (let attempt = 1; ; attempt++) {
		try {
			await expect
				.poll(() => isServed(request), { timeout: 15_000 })
				.toBe(true);
			return;
		} catch (error) {
			if (attempt === 5) throw error;
			await touchEncryptedMoment();
		}
	}
});
// Wait for the removal as well, so its reload cannot land in the next spec.
test.afterAll(async ({ request }) => {
	test.setTimeout(90_000);
	await removeEncryptedMoment();
	await expect.poll(() => isServed(request), { timeout: 60_000 }).toBe(false);
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
		await expect(card).toHaveCount(1);
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
