import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import type { Attribute, AttributeValue, Category } from "../src/prisma/client";
import type { attributeRouter } from "../src/routes/attribute.router";
import { createTestDatabase } from "./utils/db-manager";
import { expectDefined } from "./utils/helper";

describe.concurrent("Attribute routes test", () => {
	let testCategory: Category;
	let testAttributes: Attribute[] & { values: AttributeValue[] }[] = [];
	let testAttributeValues: AttributeValue[] = [];
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	let api: ReturnType<typeof treaty<typeof attributeRouter>>;

	// Setup - create test data
	beforeAll(async () => {
		if (Bun.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!Bun.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}
		testDb = await createTestDatabase("attribute.test.ts");
		const { attributeRouter } = await import("../src/routes/attribute.router");
		api = treaty(attributeRouter);

		testCategory = await testDb.client.category.create({
			data: {
				name: "Spice",
				image: {
					create: {
						key: "test-key",
						url: "https://test-url.com/image.webp",
						altText: "Spice",
						isThumbnail: true,
					},
				},
			},
		});

		const attribute1 = await testDb.client.attribute.create({
			data: {
				name: "heat level",
				categoryId: testCategory.id,
				values: {
					create: [{ value: "mild" }, { value: "medium" }, { value: "hot" }],
				},
			},
			include: { values: true },
		});

		const attribute2 = await testDb.client.attribute.create({
			data: {
				name: "origin",
				categoryId: testCategory.id,
				values: {
					create: [{ value: "india" }, { value: "mexico" }, { value: "italy" }],
				},
			},
			include: { values: true },
		});

		testAttributes = [attribute1, attribute2];
		testAttributeValues = attribute1.values.concat(attribute2.values);
	});

	afterAll(async () => {
		await testDb.destroy();
	});

	describe("GET /attributes", () => {
		test("should return all attributes", async () => {
			const { data, status } = await api.attributes.get();
			expect(status).toBe(200);
			expectDefined(data);
			expect(Array.isArray(data)).toBe(true);
			expect(data.length).toBeGreaterThanOrEqual(2);

			// Verify our test attributes are in the response
			const testAttributeIds = testAttributes.map((a) => a.id);
			const returnedAttributeIds = data.map((a) => a.id) || [];

			for (const id of testAttributeIds) {
				expect(returnedAttributeIds).toContain(id);
			}
		});

		test("should filter attributes by categoryId", async () => {
			const { data: attributes, status } = await api.attributes.get({
				query: {
					categoryId: testCategory.id,
				},
			});

			expect(status).toBe(200);
			expectDefined(attributes);
			expect(Array.isArray(attributes)).toBe(true);
			expect(attributes.length).toBeGreaterThanOrEqual(2); // We created 2 attributes for this category, but other tests may have added more

			for (const attr of attributes) {
				expect(attr.categoryId).toBe(testCategory.id);
			}
		});
	});

	describe("GET /attributes/:id", () => {
		test("should return a specific attribute", async () => {
			const testAttr = testAttributes[0];
			const { data, status } = await api.attributes({ id: testAttr.id }).get();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.id).toBe(testAttr.id);
			expect(data.name).toBe(testAttr.name);
			expect(data.categoryId).toBe(testCategory.id);

			// Verify it includes the values and category
			expect(data.values).toBeDefined();
			expect(Array.isArray(data.values)).toBe(true);
			expect(data.values.length).toBeGreaterThanOrEqual(3); // We created 3 values, but other tests may have added more
			expect(data.category).toBeDefined();
			expect(data.category.id).toBe(testCategory.id);
		});

		test("should return 404 for non-existent attribute", async () => {
			const { error, status } = await api
				.attributes({
					id: "00000000-0000-0000-0000-000000000000",
				})
				.get();

			expect(status).toBe(404);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should validate uuid format", async () => {
			const { error, status } = await api
				.attributes({
					id: "not-a-valid-uuid",
				})
				.get();

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});
	});

	describe("POST /attributes", () => {
		test("should create a new attribute with values", async () => {
			const newAttrData = {
				name: "form",
				categoryId: testCategory.id,
				values: ["powder", "whole", "flakes"],
			};

			const { data, status } = await api.attributes.post(newAttrData);

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.name).toBe(newAttrData.name);
			expect(data.categoryId).toBe(newAttrData.categoryId);

			// Verify values were created correctly
			expect(data.values).toBeDefined();
			expect(data.values.length).toBe(3);

			const valueNames = data.values.map((v) => v.value);
			for (const value of newAttrData.values) {
				expect(valueNames).toContain(value);
			}
		});

		test("should reject invalid attribute names", async () => {
			const newAttrData = {
				name: "Invalid Name", // Starts with uppercase and contains uppercase
				categoryId: testCategory.id,
				values: ["powder", "whole", "flakes"],
			};

			const { error, status } = await api.attributes.post(newAttrData);

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should reject empty values array", async () => {
			const newAttrData = {
				name: "form",
				categoryId: testCategory.id,
				values: [], // Empty array should be rejected
			};

			const { error, status } = await api.attributes.post(newAttrData);

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should reject invalid value names", async () => {
			const newAttrData = {
				name: "form",
				categoryId: testCategory.id,
				values: ["Valid", "Invalid Value", "123invalid"], // Invalid formats
			};

			const { error, status } = await api.attributes.post(newAttrData);

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should reject non-existent category ID", async () => {
			const newAttrData = {
				name: "form",
				categoryId: "00000000-0000-0000-0000-000000000000", // Non-existent category
				values: ["powder", "whole", "flakes"],
			};

			const { error, status } = await api.attributes.post(newAttrData);

			expect(status).toBe(409); // Foreign key constraint violation prisma P2003
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});
	});

	describe("PATCH /attributes/:id", () => {
		test("should update an attribute name", async () => {
			const testAttr = await testDb.client.attribute.create({
				data: {
					name: "color",
					categoryId: testCategory.id,
					values: {
						create: [{ value: "red" }, { value: "yellow" }],
					},
				},
				include: { values: true },
			});
			const newName = "texture";

			const { data, status } = await api.attributes({ id: testAttr.id }).patch({
				name: newName,
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.id).toBe(testAttr.id);
			expect(data.name).toBe(newName);
			expect(data.values.length).toBe(testAttr.values.length);
		});

		test("should reject invalid attribute names", async () => {
			const testAttr = testAttributes[0];

			const { error, status } = await api
				.attributes({ id: testAttr.id })
				.patch({
					name: "Invalid Name", // Starts with uppercase and contains uppercase
				});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should return 404 for non-existent attribute", async () => {
			const { error, status } = await api
				.attributes({
					id: "00000000-0000-0000-0000-000000000000",
				})
				.patch({
					name: "texture",
				});

			expect(status).toBe(404);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});
	});

	describe("DELETE /attributes/:id", () => {
		test("should delete an attribute", async () => {
			const tempAttr = await testDb.client.attribute.create({
				data: {
					name: "temporary",
					categoryId: testCategory.id,
					values: {
						create: [{ value: "value1" }],
					},
				},
			});
			expectDefined(tempAttr);

			const { data, status } = await api
				.attributes({ id: tempAttr.id })
				.delete();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.id).toBe(tempAttr.id);

			// Verify it's actually deleted
			const checkAttr = await testDb.client.attribute.findUnique({
				where: { id: tempAttr.id },
			});
			expect(checkAttr).toBeNull();

			// Verify the values are also deleted (thanks to Prisma's cascading delete)
			const checkValues = await testDb.client.attributeValue.findMany({
				where: { attributeId: tempAttr.id },
			});
			expect(checkValues.length).toBe(0);
		});

		test("should return 404 for non-existent attribute", async () => {
			const { error, status } = await api
				.attributes({
					id: "00000000-0000-0000-0000-000000000000",
				})
				.delete();

			expect(status).toBe(404);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});
	});

	describe("POST /attributes/:id/values", () => {
		test("should create a new attribute value", async () => {
			const testAttr = testAttributes[1]; // Use the "origin" attribute
			const newValue = "france";

			const { data, status } = await api
				.attributes({ id: testAttr.id })
				.values.post({
					value: newValue,
				});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.value).toBe(newValue);
			expect(data.attributeId).toBe(testAttr.id);
		});

		test("should reject invalid value names", async () => {
			const testAttr = testAttributes[1];

			const { error, status } = await api
				.attributes({ id: testAttr.id })
				.values.post({
					value: "Invalid Value", // Invalid format
				});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should return 409 for non-existent attribute", async () => {
			const { error, status } = await api
				.attributes({ id: "00000000-0000-0000-0000-000000000000" })
				.values.post({
					value: "france",
				});

			expect(status).toBe(409); // Foreign key constraint violation prisma P2003
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});
	});

	describe("PATCH /attributes/values/:id", () => {
		test("should update an attribute value", async () => {
			const testAttr = await testDb.client.attribute.create({
				data: {
					name: "example",
					categoryId: testCategory.id,
					values: {
						create: [{ value: "sample" }],
					},
				},
				include: { values: true },
			});
			expectDefined(testAttr);

			const testValue = testAttr.values[0];
			const newValueText = "extreme";
			const { data, status } = await api.attributes
				.values({ id: testValue.id })
				.patch({
					value: newValueText,
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.id).toBe(testValue.id);
			expect(data.value).toBe(newValueText);
			expect(data.attributeId).toBe(testValue.attributeId);
		});

		test("should reject invalid value names", async () => {
			const testValue = testAttributeValues[0];

			const { error, status } = await api.attributes
				.values({ id: testValue.id })
				.patch({
					value: "Invalid Value", // Invalid format
				});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should return 404 for non-existent value", async () => {
			const { error, status } = await api.attributes
				.values({
					id: "00000000-0000-0000-0000-000000000000",
				})
				.patch({
					value: "extreme",
				});

			expect(status).toBe(404);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});
	});

	describe("DELETE /attributes/values/:id", () => {
		test("should delete an attribute value", async () => {
			const testAttr = testAttributes[0];
			const tempValue = await testDb.client.attributeValue.create({
				data: {
					value: "temporary",
					attributeId: testAttr.id,
				},
			});
			expectDefined(tempValue);

			const { data, status } = await api.attributes
				.values({ id: tempValue.id })
				.delete();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.id).toBe(tempValue.id);

			// Verify it's actually deleted
			const checkValue = await testDb.client.attributeValue.findUnique({
				where: { id: tempValue.id },
			});
			expect(checkValue).toBeNull();
		});

		test("should return 404 for non-existent value", async () => {
			const { error, status } = await api.attributes
				.values({
					id: "00000000-0000-0000-0000-000000000000",
				})
				.delete();

			expect(status).toBe(404);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});
	});
});
