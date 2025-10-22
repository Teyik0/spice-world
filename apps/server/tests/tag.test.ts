import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import type { PrismaClient } from "../src/prisma/client";
import type { tagRouter } from "../src/routes/tag.router";
import { createTestDatabase } from "./utils/db-manager";
import { expectDefined } from "./utils/helper";

describe.concurrent("Tags routes test", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	let api: ReturnType<typeof treaty<typeof tagRouter>>;

	const createTags = async (
		client: PrismaClient,
		count: number,
		prefix = "",
		startChar = 97,
	) => {
		const promises = [];
		for (let i = 0; i < count; i++) {
			const char = String.fromCharCode(startChar + i);
			promises.push(
				client.tag.create({
					data: {
						name: `${prefix} tag ${char}`,
						badgeColor: "#FF032F",
					},
				}),
			);
		}
		return await Promise.all(promises);
	};

	beforeAll(async () => {
		if (Bun.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!Bun.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}
		testDb = await createTestDatabase("tag.test.ts");
		const { tagRouter } = await import("../src/routes/tag.router");
		api = treaty(tagRouter);
	});

	afterAll(async () => {
		await testDb.destroy();
	});

	describe("Create new tag - POST/", () => {
		test("should create a tag", async () => {
			const tagCreationPromises = Array.from({ length: 25 }, (_, i) => {
				const char = String.fromCharCode(97 + i);
				return api.tags.post({
					name: `tag ${char}`,
					badgeColor: "#FF032F",
				});
			});

			const results = await Promise.all(tagCreationPromises);

			results.forEach((result, i) => {
				const char = String.fromCharCode(97 + i);
				const { data, status } = result;

				expect(status).toBe(201);
				expectDefined(data);
				expect(data.id).toBeDefined();
				expect(data.name).toBe(`tag ${char}`);
				expect(data.badgeColor).toBe("#FF032F");
				expect(data.createdAt).toBeDefined();
				expect(data.updatedAt).toBeDefined();
			});
		});

		test("should throw an error if badge is not a color valid hex - (1)", async () => {
			const { error, data } = await api.tags.post({
				name: "data one",
				badgeColor: "F21DE2",
			});

			expect(data).toBe(null);
			expectDefined(error);
			expect(error.status).toBe(422);
			// Extract the type for 422 validation errors
			type ValidationError = Extract<
				typeof error.value,
				{ type: "validation" }
			>;
			const validationError = error.value as ValidationError;
			expect(validationError.type).toBe("validation");
			expect(validationError.property).toBe("/badgeColor");
		});

		test("should throw an error if badge is not a color valid hex - (2)", async () => {
			// Hexadecimal color code must be 6 characters long
			const { error, data } = await api.tags.post({
				name: "data two",
				badgeColor: "#00112233",
			});

			expect(data).toBe(null);
			expectDefined(error);
			expect(error.status).toBe(422);
			// Extract the type for 422 validation errors
			type ValidationError = Extract<
				typeof error.value,
				{ type: "validation" }
			>;
			const validationError = error.value as ValidationError;
			expect(validationError.type).toBe("validation");
			expect(validationError.property).toBe("/badgeColor");
		});

		test("should throw an error if badge is not a color valid hex - (3)", async () => {
			// Hexadecimal color code must be 6 characters long
			const { error, data } = await api.tags.post({
				name: "data three",
				badgeColor: "#00",
			});

			expect(data).toBe(null);
			expectDefined(error);
			expect(error.status).toBe(422);
			// Extract the type for 422 validation errors
			type ValidationError = Extract<
				typeof error.value,
				{ type: "validation" }
			>;
			const validationError = error.value as ValidationError;
			expect(validationError.type).toBe("validation");
			expect(validationError.property).toBe("/badgeColor");
		});

		test("should throw an error if badge is not a color valid hex - (4)", async () => {
			// Hexadecimal color code must be between A-F
			const { error, data } = await api.tags.post({
				name: "data four",
				badgeColor: "#GEZE02",
			});

			expect(data).toBe(null);
			expectDefined(error);
			expect(error.status).toBe(422);
			// Extract the type for 422 validation errors
			type ValidationError = Extract<
				typeof error.value,
				{ type: "validation" }
			>;
			const validationError = error.value as ValidationError;
			expect(validationError.type).toBe("validation");
			expect(validationError.property).toBe("/badgeColor");
		});

		test("should throw P2002 error when creating tag with duplicate name", async () => {
			const uniqueName = "unique tag name for duplicate test";

			// Create first tag
			const { data: firstTag, status: firstStatus } = await api.tags.post({
				name: uniqueName,
				badgeColor: "#FF0323",
			});

			expect(firstStatus).toBe(201);
			expectDefined(firstTag);

			// Try to create second tag with same name - should fail with P2002
			const { error, data, status } = await api.tags.post({
				name: uniqueName,
				badgeColor: "#00FF00",
			});

			expect(status).toBe(409); // Conflict
			expect(data).toBeNull();
			expectDefined(error);
			const errorMessage = error.value as { message: string; code: string };
			expect(errorMessage.message).toContain("Tag with this");
			expect(errorMessage.message).toContain("already exists");
		});

		test("should throw P2000 error when tag name exceeds VARCHAR(100) limit", async () => {
			// Create a string longer than 100 characters (our VARCHAR limit)
			const tooLongName = "a".repeat(150);

			const { error, data, status } = await api.tags.post({
				name: tooLongName,
				badgeColor: "#FF0323",
			});

			expect(status).toBe(400); // Bad Request
			expect(data).toBeNull();
			expectDefined(error);
			expect(error.value).toMatchObject({
				message: expect.stringContaining("too long"),
				code: "P2000",
			});
		});
	});

	describe("Get tags by id - GET/:id", () => {
		test("should return a single tag", async () => {
			const { data } = await api.tags.post({
				name: "data by id",
				badgeColor: "#FF0323",
			});
			expectDefined(data);

			const { data: tag } = await api.tags({ id: data.id }).get();
			expectDefined(tag);
			expect(tag).toEqual(data);
		});
	});

	describe("Get tags - GET/", () => {
		test("should return 20 tags", async () => {
			await createTags(testDb.client, 20, "prefix a");
			const { data } = await api.tags.get({
				query: {
					skip: 0,
					take: 20,
				},
			});

			expectDefined(data);
			expect(data.length).toBe(20);
		});

		test("should return tags with pagination", async () => {
			await createTags(testDb.client, 20, "prefix c");
			const { data } = await api.tags.get({
				query: {
					skip: 0,
					take: 10,
				},
			});
			expectDefined(data);
			expect(data.length).toBe(10);

			const { data: data2 } = await api.tags.get({
				query: {
					skip: 1,
					take: 10,
				},
			});
			expectDefined(data2);
			expect(data2.length).toBe(10);
			expect(data2).not.toBe(data);
			expect(data2).not.toEqual(data);
		});

		test("should return tags with specific search - (1)", async () => {
			await createTags(testDb.client, 1, "prefix specific");
			const { data } = await api.tags.get({
				query: {
					skip: 0,
					take: 10,
					name: "prefix specific",
				},
			});
			expectDefined(data);
			expect(data.length).toBe(1);
			expect(data[0].name).toContain("prefix specific");
		});

		test("should return tags with specific search - (2)", async () => {
			const prefix = "prefix search";
			const number = 12;
			await createTags(testDb.client, number, prefix);
			const { data } = await api.tags.get({
				query: {
					skip: 0,
					take: 100,
					name: prefix,
				},
			});
			expectDefined(data);
			expect(data.length).toBe(number);
		});
	});

	describe("Delete tags - DELETE/:id", () => {
		test("should delete a tag", async () => {
			const { data: createdTag } = await api.tags.post({
				name: "tag to delete",
				badgeColor: "#FF0323",
			});

			const { data: deletedTag } = await api
				.tags({ id: createdTag?.id as string })
				.delete();
			expect(deletedTag).toBeDefined();
			expect(deletedTag?.id).toBe(createdTag?.id as string);

			const { data: fetchedTag, error } = await api
				.tags({ id: createdTag?.id as string })
				.get();
			expect(fetchedTag).toBeNull();
			expect(error?.value).toBe("Tag not found");
		});
	});

	describe("Update tags - PATCH/:id", () => {
		test("should update a tag", async () => {
			const { data: createdTag } = await api.tags.post({
				name: "original name",
				badgeColor: "#FF0323",
			});
			expect(createdTag).toBeDefined();

			const { data: updatedTag } = await api
				.tags({ id: createdTag?.id as string })
				.patch({
					name: "updated name",
					badgeColor: "#00FF00",
				});

			expect(updatedTag).toBeDefined();
			expect(updatedTag?.id).toBe(createdTag?.id as string);
			expect(updatedTag?.name).toBe("updated name");
			expect(updatedTag?.badgeColor).toBe("#00FF00");
		});
	});
});
