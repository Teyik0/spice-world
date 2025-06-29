import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { prisma } from "../src/lib/prisma";
import type { Attribute, AttributeValue, Category } from "../src/prisma/client";
import { attributeRouter } from "../src/routes/attribute.router";
import { resetDb } from "./utils/reset-db";

const api = treaty(attributeRouter);

describe("Attribute routes test", () => {
	let testCategory: Category;
	let testAttributes: Attribute[] & { values: AttributeValue[] }[] = [];
	let testAttributeValues: AttributeValue[] = [];

	// Setup - create test data
	beforeAll(async () => {
		if (process.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}

		await resetDb();

		testCategory = await prisma.category.create({
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

		const attribute1 = await prisma.attribute.create({
			data: {
				name: "heat level",
				categoryId: testCategory.id,
				values: {
					create: [{ value: "mild" }, { value: "medium" }, { value: "hot" }],
				},
			},
			include: { values: true },
		});

		const attribute2 = await prisma.attribute.create({
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
		await resetDb();
	});

	describe("GET /attributes", () => {
		it("should return all attributes", async () => {
			const { data, status } = await api.attributes.get({ query: {} });
			expect(status).toBe(200);
			expect(data).not.toBeNull();
			expect(Array.isArray(data)).toBe(true);
			expect(data?.length).toBe(2);

			// Verify our test attributes are in the response
			const testAttributeIds = testAttributes.map((a) => a.id);
			const returnedAttributeIds = data?.map((a) => a.id) || [];

			for (const id of testAttributeIds) {
				expect(returnedAttributeIds).toContain(id);
			}
		});

		it("should filter attributes by categoryId", async () => {
			const { data, status } = await api.attributes.get({
				query: {
					categoryId: testCategory.id,
				},
			});

			expect(status).toBe(200);
			expect(data).not.toBeNull();
			expect(Array.isArray(data)).toBe(true);
			expect(data?.length).toBe(2); // We created exactly 2 attributes for this category

			for (const attr of data as Attribute[]) {
				expect(attr.categoryId).toBe(testCategory.id);
			}
		});
	});

	describe("GET /attributes/:id", () => {
		it("should return a specific attribute", async () => {
			const testAttr = testAttributes[0];
			const { data, status } = await api.attributes({ id: testAttr.id }).get();

			expect(status).toBe(200);
			expect(data).not.toBeNull();
			expect(data?.id).toBe(testAttr.id);
			expect(data?.name).toBe(testAttr.name);
			expect(data?.categoryId).toBe(testCategory.id);

			// Verify it includes the values and category
			expect(data?.values).toBeDefined();
			expect(Array.isArray(data?.values)).toBe(true);
			expect(data?.values.length).toBe(3); // We created 3 values for each attribute
			expect(data?.category).toBeDefined();
			expect(data?.category.id).toBe(testCategory.id);
		});

		it("should return 404 for non-existent attribute", async () => {
			const { error, status } = await api
				.attributes({
					id: "00000000-0000-0000-0000-000000000000",
				})
				.get();

			expect(status).toBe(404);
			expect(error).not.toBeNull();
		});

		it("should validate uuid format", async () => {
			const { error, status } = await api
				.attributes({
					id: "not-a-valid-uuid",
				})
				.get();

			expect(status).toBe(422);
			expect(error).not.toBeNull();
		});
	});

	describe("POST /attributes", () => {
		it("should create a new attribute with values", async () => {
			const newAttrData = {
				name: "form",
				categoryId: testCategory.id,
				values: ["powder", "whole", "flakes"],
			};

			const { data, status } = await api.attributes.post(newAttrData);

			expect(status).toBe(201);
			expect(data).not.toBeNull();
			expect(data?.name).toBe(newAttrData.name);
			expect(data?.categoryId).toBe(newAttrData.categoryId);

			// Verify values were created correctly
			expect(data?.values).toBeDefined();
			expect(data?.values.length).toBe(3);

			const valueNames = data?.values.map((v) => v.value);
			for (const value of newAttrData.values) {
				expect(valueNames).toContain(value);
			}

			// Clean up the created attribute
			if (data?.id) {
				await prisma.$transaction([
					prisma.attributeValue.deleteMany({
						where: { attributeId: data.id },
					}),
					prisma.attribute.delete({
						where: { id: data.id },
					}),
				]);
			}
		});

		it("should reject invalid attribute names", async () => {
			const newAttrData = {
				name: "Invalid Name", // Starts with uppercase and contains uppercase
				categoryId: testCategory.id,
				values: ["powder", "whole", "flakes"],
			};

			const { error, status } = await api.attributes.post(newAttrData);

			expect(status).toBe(422);
			expect(error).not.toBeNull();
		});

		it("should reject empty values array", async () => {
			const newAttrData = {
				name: "form",
				categoryId: testCategory.id,
				values: [], // Empty array should be rejected
			};

			const { error, status } = await api.attributes.post(newAttrData);

			expect(status).toBe(422);
			expect(error).not.toBeNull();
		});

		it("should reject invalid value names", async () => {
			const newAttrData = {
				name: "form",
				categoryId: testCategory.id,
				values: ["Valid", "Invalid Value", "123invalid"], // Invalid formats
			};

			const { error, status } = await api.attributes.post(newAttrData);

			expect(status).toBe(422);
			expect(error).not.toBeNull();
		});

		it("should reject non-existent category ID", async () => {
			const newAttrData = {
				name: "form",
				categoryId: "00000000-0000-0000-0000-000000000000", // Non-existent category
				values: ["powder", "whole", "flakes"],
			};

			const { error, status } = await api.attributes.post(newAttrData);

			expect(status).toBe(409); // Foreign key constraint violation prisma P2003
			expect(error).not.toBeNull();
		});
	});

	describe("PATCH /attributes/:id", () => {
		it("should update an attribute name", async () => {
			const testAttr = testAttributes[0];
			const newName = "texture";

			const { data, status } = await api.attributes({ id: testAttr.id }).patch({
				name: newName,
			});

			expect(status).toBe(200);
			expect(data).not.toBeNull();
			expect(data?.id).toBe(testAttr.id);
			expect(data?.name).toBe(newName);

			// Values should remain unchanged
			expect(data?.values.length).toBe(testAttr.values.length);
		});

		it("should reject invalid attribute names", async () => {
			const testAttr = testAttributes[0];

			const { error, status } = await api
				.attributes({ id: testAttr.id })
				.patch({
					name: "Invalid Name", // Starts with uppercase and contains uppercase
				});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
		});

		it("should return 404 for non-existent attribute", async () => {
			const { error, status } = await api
				.attributes({
					id: "00000000-0000-0000-0000-000000000000",
				})
				.patch({
					name: "texture",
				});

			expect(status).toBe(404);
			expect(error).not.toBeNull();
		});
	});

	describe("DELETE /attributes/:id", () => {
		it("should delete an attribute", async () => {
			// Create a temporary attribute to delete
			const tempAttr = await prisma.attribute.create({
				data: {
					name: "temporary",
					categoryId: testCategory.id,
					values: {
						create: [{ value: "value1" }],
					},
				},
			});

			const { data, status } = await api
				.attributes({ id: tempAttr.id })
				.delete();

			expect(status).toBe(200);
			expect(data).not.toBeNull();
			expect(data?.id).toBe(tempAttr.id);

			// Verify it's actually deleted
			const checkAttr = await prisma.attribute.findUnique({
				where: { id: tempAttr.id },
			});
			expect(checkAttr).toBeNull();

			// Verify the values are also deleted (thanks to Prisma's cascading delete)
			const checkValues = await prisma.attributeValue.findMany({
				where: { attributeId: tempAttr.id },
			});
			expect(checkValues.length).toBe(0);
		});

		it("should return 404 for non-existent attribute", async () => {
			const { error, status } = await api
				.attributes({
					id: "00000000-0000-0000-0000-000000000000",
				})
				.delete();

			expect(status).toBe(404);
			expect(error).not.toBeNull();
		});
	});

	describe("POST /attributes/:id/values", () => {
		it("should create a new attribute value", async () => {
			const testAttr = testAttributes[1]; // Use the "origin" attribute
			const newValue = "france";

			const { data, status } = await api
				.attributes({ id: testAttr.id })
				.values.post({
					value: newValue,
				});

			expect(status).toBe(201);
			expect(data).not.toBeNull();
			expect(data?.value).toBe(newValue);
			expect(data?.attributeId).toBe(testAttr.id);

			// Clean up
			if (data?.id) {
				await prisma.attributeValue.delete({
					where: { id: data.id },
				});
			}
		});

		it("should reject invalid value names", async () => {
			const testAttr = testAttributes[1];

			const { error, status } = await api
				.attributes({ id: testAttr.id })
				.values.post({
					value: "Invalid Value", // Invalid format
				});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
		});

		it("should return 409 for non-existent attribute", async () => {
			const { error, status } = await api
				.attributes({ id: "00000000-0000-0000-0000-000000000000" })
				.values.post({
					value: "france",
				});

			expect(status).toBe(409); // Foreign key constraint violation prisma P2003
			expect(error).not.toBeNull();
		});
	});

	describe("PATCH /attributes/values/:id", () => {
		it("should update an attribute value", async () => {
			const testValue = testAttributeValues[0];
			const newValueText = "extreme";

			const { data, status } = await api.attributes
				.values({ id: testValue.id })
				.patch({
					value: newValueText,
				});

			expect(status).toBe(200);
			expect(data).not.toBeNull();
			expect(data?.id).toBe(testValue.id);
			expect(data?.value).toBe(newValueText);
			expect(data?.attributeId).toBe(testValue.attributeId);
		});

		it("should reject invalid value names", async () => {
			const testValue = testAttributeValues[0];

			const { error, status } = await api.attributes
				.values({ id: testValue.id })
				.patch({
					value: "Invalid Value", // Invalid format
				});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
		});

		it("should return 404 for non-existent value", async () => {
			const { error, status } = await api.attributes
				.values({
					id: "00000000-0000-0000-0000-000000000000",
				})
				.patch({
					value: "extreme",
				});

			expect(status).toBe(404);
			expect(error).not.toBeNull();
		});
	});

	describe("DELETE /attributes/values/:id", () => {
		it("should delete an attribute value", async () => {
			// Create a temporary value to delete
			const testAttr = testAttributes[0];
			const tempValue = await prisma.attributeValue.create({
				data: {
					value: "temporary",
					attributeId: testAttr.id,
				},
			});

			const { data, status } = await api.attributes
				.values({ id: tempValue.id })
				.delete();

			expect(status).toBe(200);
			expect(data).not.toBeNull();
			expect(data?.id).toBe(tempValue.id);

			// Verify it's actually deleted
			const checkValue = await prisma.attributeValue.findUnique({
				where: { id: tempValue.id },
			});
			expect(checkValue).toBeNull();
		});

		it("should return 404 for non-existent value", async () => {
			const { error, status } = await api.attributes
				.values({
					id: "00000000-0000-0000-0000-000000000000",
				})
				.delete();

			expect(status).toBe(404);
			expect(error).not.toBeNull();
		});
	});
});
