import assert from "node:assert/strict";
import test from "node:test";
import {
	normalizePage,
	normalizePageSize,
	paginationPages,
} from "../src/utils/pagination.ts";

test("page window keeps boundaries, fills edges and collapses only actual gaps", () => {
	assert.deepEqual(paginationPages(1, 1), [1]);
	assert.deepEqual(paginationPages(1, 3), [1, 2, 3]);
	assert.deepEqual(paginationPages(1, 40), [1, 2, 3, 4, 5, -1, 40]);
	assert.deepEqual(
		paginationPages(20, 40),
		[1, -1, 18, 19, 20, 21, 22, -1, 40],
	);
	assert.deepEqual(paginationPages(40, 40), [1, -1, 36, 37, 38, 39, 40]);
	assert.deepEqual(paginationPages(4, 7), [1, 2, 3, 4, 5, 6, 7]);
	assert.deepEqual(paginationPages(1, 0), []);
});

test("URL pages accept only positive decimal integers and clamp to the last page", () => {
	for (const value of [
		null,
		undefined,
		"",
		"no",
		"1.5",
		"-2",
		"0",
		"2x",
		"1e2",
		"0x10",
		Number.POSITIVE_INFINITY,
		Number.NaN,
	]) {
		assert.equal(normalizePage(value, 40), 1, String(value));
	}
	assert.equal(normalizePage("02", 40), 2);
	assert.equal(normalizePage("999", 40), 40);
	assert.equal(normalizePage(2, 0), 1);
});

test("optional page sizes preserve old configs and reject invalid values", () => {
	for (const value of [
		undefined,
		null,
		"24",
		0,
		-1,
		2.5,
		Number.POSITIVE_INFINITY,
		Number.NaN,
	]) {
		assert.equal(normalizePageSize(value), 12);
	}
	assert.equal(normalizePageSize(24), 24);
});
