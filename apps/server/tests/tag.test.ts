import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { prisma } from "../src/lib/prisma";
import { tagRouter } from "../src/routes/tag.router";
import { expectDefined } from "./utils/helper";
import { resetDb } from "./utils/reset-db";

const api = treaty(tagRouter);

const createTags = async (count: number, prefix = "", startChar = 97) => {
	const promises = [];
	for (let i = 0; i < count; i++) {
		const char = String.fromCharCode(startChar + i);
		promises.push(
			prisma.tag.create({
				data: {
					name: `${prefix}tag ${char}`,
					badgeColor: "#FF032F",
				},
			}),
		);
	}
	await Promise.all(promises);
};

describe("Tags routes test", () => {
	beforeAll(async () => {
		if (process.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}
		await resetDb();
	});

	afterAll(async () => {
		await resetDb();
	});

	describe.serial("Create new tag - POST/", () => {
		it.concurrent("should create a tag", async () => {
			const tagCreationPromises = Array.from({ length: 25 }, (_, i) => {
				const char = String.fromCharCode(97 + i);
				return api.tags.post({
					name: `create tag ${char}`,
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
				expect(data.name).toBe(`create tag ${char}`);
				expect(data.badgeColor).toBe("#FF032F");
				expect(data.createdAt).toBeDefined();
				expect(data.updatedAt).toBeDefined();
			});
		});

		it.concurrent(
			"should throw an error if badge is not a color valid hex - (1)",
			async () => {
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
			},
		);

		it.concurrent(
			"should throw an error if badge is not a color valid hex - (2)",
			async () => {
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
			},
		);

		it.concurrent(
			"should throw an error if badge is not a color valid hex - (3)",
			async () => {
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
			},
		);

		it.concurrent(
			"should throw an error if badge is not a color valid hex - (4)",
			async () => {
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
			},
		);
	});

	describe.serial("Get tags by id - GET/:id", () => {
		it("should return a single tag", async () => {
			const { data } = await api.tags.post({
				name: "data by id",
				badgeColor: "#FF0323",
			});

			const tag = await prisma.tag.findUnique({
				where: {
					id: data?.id as string,
				},
			});
			expect(tag).toEqual(data);
		});
	});

	describe.serial("Get tags count - GET/count", () => {
		beforeAll(async () => {
			await resetDb();
			await createTags(5, "count ");
		});

		it("should return the count of tags", async () => {
			const { data } = await api.tags.count.get();
			const totalTags = await prisma.tag.count();
			expect(data).toBe(totalTags);
		});
	});

	describe.serial("Get tags - GET/", () => {
		beforeAll(async () => {
			await resetDb();
			await createTags(25);
		});

		it.concurrent("should return 20 tags", async () => {
			const { data } = await api.tags.get({
				query: {
					skip: 0,
					take: 20,
				},
			});

			expectDefined(data);
			expect(data.length).toBe(20);
		});

		it.concurrent("should return all the tags in the database", async () => {
			const { data } = await api.tags.get({
				query: {
					skip: 0,
					take: 100,
				},
			});

			expectDefined(data);
			expect(data.length).toBe(25);
		});

		it.concurrent("should return tags with pagination", async () => {
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

		it.concurrent("should return tags with specific search - (1)", async () => {
			const { data } = await api.tags.get({
				query: {
					skip: 0,
					take: 10,
					name: "tag a",
				},
			});
			expectDefined(data);
			expect(data.length).toBe(1);
			expect(data[0].name).toBe("tag a");
		});

		it.concurrent("should return tags with specific search - (2)", async () => {
			const { data } = await api.tags.get({
				query: {
					skip: 0,
					take: 100,
					name: "tag",
				},
			});
			expectDefined(data);
			// All 25 tags created in beforeAll have pattern "tag [a-z]"
			// The space after "tag" ensures we only match those specific tags
			expect(data.length).toBe(25);
		});
	});

	describe.serial("Delete tags - DELETE/:id", () => {
		it.concurrent("should delete a tag", async () => {
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

	describe.serial("Update tags - PATCH/:id", () => {
		it.concurrent("should update a tag", async () => {
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
