import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { validateVariants } from "@spice-world/server/modules/products/validators/variants";
import type { ValidationError } from "@spice-world/server/modules/shared";
import { createTestDatabase } from "@spice-world/server/utils/db-manager";
import {
	createTestCategory,
	randomLowerString,
} from "@spice-world/server/utils/helper";

describe("validateVariants", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	let category: Awaited<ReturnType<typeof createTestCategory>>;
	let otherCategory: Awaited<ReturnType<typeof createTestCategory>>;

	beforeAll(async () => {
		testDb = await createTestDatabase("product.variants.test.ts");
		category = await createTestCategory({
			testDb,
			name: `validators-main-${randomLowerString(6)}`,
			attributeCount: 2,
			attributeValueCount: 3,
		});
		otherCategory = await createTestCategory({
			testDb,
			name: `validators-other-${randomLowerString(6)}`,
			attributeCount: 1,
			attributeValueCount: 2,
		});
	});

	afterAll(async () => {
		await testDb.destroy();
	}, 10000);

	const getAttrValues = (cat: typeof category, attrIndex: number) => {
		const attr = cat.attributes[attrIndex];
		if (!attr) throw new Error(`Attribute at index ${attrIndex} not found`);
		return attr.values.map((v) => v.id);
	};

	describe("VVA1: Invalid attribute values", () => {
		it("should pass with valid attribute values from correct category", () => {
			const values = getAttrValues(category, 0);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{
							price: 10,
							attributeValueIds: [values[0] as string],
						},
					],
				},
			});

			expect(result.success).toBe(true);
		});

		it("should fail with attribute value from different category", () => {
			const otherValues = getAttrValues(otherCategory, 0);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{
							price: 10,
							attributeValueIds: [otherValues[0] as string],
						},
					],
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA1")).toBe(true);
			}
		});

		it("should fail with mix of valid and invalid attribute values", () => {
			const validValues = getAttrValues(category, 0);
			const invalidValues = getAttrValues(otherCategory, 0);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{
							price: 10,
							attributeValueIds: [
								validValues[0] as string,
								invalidValues[0] as string,
							],
						},
					],
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA1")).toBe(true);
			}
		});

		it("should pass with empty attributeValueIds (skips validation)", () => {
			const result = validateVariants({
				category,
				vOps: {
					create: [
						{
							price: 10,
							attributeValueIds: [],
						},
					],
				},
			});

			expect(result.success).toBe(true);
		});

		it("should fail with completely non-existent attribute value ID", () => {
			const fakeId = "00000000-0000-0000-0000-000000000000";

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{
							price: 10,
							attributeValueIds: [fakeId],
						},
					],
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA1")).toBe(true);
			}
		});

		it("should validate attribute values in update operations", () => {
			const otherValues = getAttrValues(otherCategory, 0);

			const result = validateVariants({
				category,
				vOps: {
					update: [
						{
							id: "existing-variant-id",
							price: 15,
							attributeValueIds: [otherValues[0] as string],
						},
					],
				},
				currVariants: [
					{
						id: "existing-variant-id",
						attributeValueIds: [],
					},
				],
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA1")).toBe(true);
			}
		});
	});

	describe("VVA2: Multiple values for same attribute", () => {
		it("should pass with one value per attribute", () => {
			const attr1Values = getAttrValues(category, 0);
			const attr2Values = getAttrValues(category, 1);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{
							price: 10,
							attributeValueIds: [
								attr1Values[0] as string,
								attr2Values[0] as string,
							],
						},
					],
				},
			});

			expect(result.success).toBe(true);
		});

		it("should fail with two values from same attribute", () => {
			const attr1Values = getAttrValues(category, 0);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{
							price: 10,
							attributeValueIds: [
								attr1Values[0] as string,
								attr1Values[1] as string,
							],
						},
					],
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA2")).toBe(true);
			}
		});

		it("should fail with three values from same attribute", () => {
			const attr1Values = getAttrValues(category, 0);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{
							price: 10,
							attributeValueIds: [
								attr1Values[0] as string,
								attr1Values[1] as string,
								attr1Values[2] as string,
							],
						},
					],
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				// Should have multiple VVA2 errors (one for each duplicate)
				const vva2Errors = errors?.subErrors?.filter((e) => e.code === "VVA2");
				expect(vva2Errors?.length).toBeGreaterThanOrEqual(1);
			}
		});

		it("should validate VVA2 in update operations", () => {
			const attr1Values = getAttrValues(category, 0);

			const result = validateVariants({
				category,
				vOps: {
					update: [
						{
							id: "existing-variant-id",
							price: 15,
							attributeValueIds: [
								attr1Values[0] as string,
								attr1Values[1] as string,
							],
						},
					],
				},
				currVariants: [
					{
						id: "existing-variant-id",
						attributeValueIds: [],
					},
				],
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA2")).toBe(true);
			}
		});
	});

	describe("VVA3: Exceeds max combinations", () => {
		it("should pass when variant count is within limit", () => {
			const attr1Values = getAttrValues(category, 0);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{ price: 10, attributeValueIds: [attr1Values[0] as string] },
						{ price: 10, attributeValueIds: [attr1Values[1] as string] },
					],
				},
			});

			// Category has 2 attrs × 3 values = 9 max, creating 2 is fine
			expect(result.success).toBe(true);
		});

		it("should pass when variant count equals max limit", async () => {
			// Create a small category: 1 attr × 2 values = max 2 combinations
			const smallCategory = await createTestCategory({
				testDb,
				name: `small-cat-${randomLowerString(6)}`,
				attributeCount: 1,
				attributeValueCount: 2,
			});

			const attrValues = getAttrValues(smallCategory, 0);

			const result = validateVariants({
				category: smallCategory,
				vOps: {
					create: [
						{ price: 10, attributeValueIds: [attrValues[0] as string] },
						{ price: 10, attributeValueIds: [attrValues[1] as string] },
					],
				},
			});

			expect(result.success).toBe(true);
		});

		it("should fail when variant count exceeds max limit (POST)", async () => {
			// Create a small category: 1 attr × 2 values = max 2 combinations
			const smallCategory = await createTestCategory({
				testDb,
				name: `small-cat-exceed-${randomLowerString(6)}`,
				attributeCount: 1,
				attributeValueCount: 2,
			});

			const attrValues = getAttrValues(smallCategory, 0);

			const result = validateVariants({
				category: smallCategory,
				vOps: {
					create: [
						{ price: 10, attributeValueIds: [attrValues[0] as string] },
						{ price: 10, attributeValueIds: [attrValues[1] as string] },
						{ price: 10, attributeValueIds: [] }, // 3rd variant exceeds max of 2
					],
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA3")).toBe(true);
			}
		});

		it("should fail when PATCH creates too many variants (existing + create)", async () => {
			// Create a small category: 1 attr × 2 values = max 2 combinations
			const smallCategory = await createTestCategory({
				testDb,
				name: `small-cat-patch-${randomLowerString(6)}`,
				attributeCount: 1,
				attributeValueCount: 2,
			});

			const attrValues = getAttrValues(smallCategory, 0);

			const result = validateVariants({
				category: smallCategory,
				vOps: {
					create: [
						{ price: 10, attributeValueIds: [attrValues[1] as string] },
						{ price: 10, attributeValueIds: [] },
					],
				},
				currVariants: [
					{
						id: "existing-1",
						attributeValueIds: [attrValues[0] as string],
					},
				],
			});

			// 1 existing + 2 create = 3 > max 2
			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA3")).toBe(true);
			}
		});

		it("should pass when deletes bring count within limit", async () => {
			// Create a small category: 1 attr × 2 values = max 2 combinations
			const smallCategory = await createTestCategory({
				testDb,
				name: `small-cat-delete-${randomLowerString(6)}`,
				attributeCount: 1,
				attributeValueCount: 2,
			});

			const attrValues = getAttrValues(smallCategory, 0);

			const result = validateVariants({
				category: smallCategory,
				vOps: {
					create: [{ price: 10, attributeValueIds: [attrValues[1] as string] }],
					delete: ["existing-1", "existing-2"],
				},
				currVariants: [
					{ id: "existing-1", attributeValueIds: [attrValues[0] as string] },
					{ id: "existing-2", attributeValueIds: [attrValues[1] as string] },
					{ id: "existing-3", attributeValueIds: [] },
				],
			});

			// 3 existing - 2 delete + 1 create = 2 = max 2
			expect(result.success).toBe(true);
		});

		it("should handle category with no attributes (max 1 variant)", async () => {
			const noAttrCategory = await createTestCategory({
				testDb,
				name: `no-attr-cat-${randomLowerString(6)}`,
				attributeCount: 0,
			});

			const result = validateVariants({
				category: noAttrCategory,
				vOps: {
					create: [
						{ price: 10, attributeValueIds: [] },
						{ price: 20, attributeValueIds: [] },
					],
				},
			});

			// No attributes means max 1 variant (1^0 = 1)
			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA3")).toBe(true);
			}
		});
	});

	describe("VVA4: Duplicate attribute combinations", () => {
		it("should pass with unique attribute combinations", () => {
			const attr1Values = getAttrValues(category, 0);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{ price: 10, attributeValueIds: [attr1Values[0] as string] },
						{ price: 10, attributeValueIds: [attr1Values[1] as string] },
					],
				},
			});

			expect(result.success).toBe(true);
		});

		it("should fail with duplicate combinations in create", () => {
			const attr1Values = getAttrValues(category, 0);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{ price: 10, attributeValueIds: [attr1Values[0] as string] },
						{ price: 20, attributeValueIds: [attr1Values[0] as string] }, // Duplicate!
					],
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA4")).toBe(true);
			}
		});

		it("should fail when create duplicates existing variant", () => {
			const attr1Values = getAttrValues(category, 0);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{ price: 10, attributeValueIds: [attr1Values[0] as string] },
					],
				},
				currVariants: [
					{
						id: "existing-1",
						attributeValueIds: [attr1Values[0] as string], // Same as create!
					},
				],
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA4")).toBe(true);
			}
		});

		it("should fail when update creates duplicate with another variant", () => {
			const attr1Values = getAttrValues(category, 0);

			const result = validateVariants({
				category,
				vOps: {
					update: [
						{
							id: "existing-1",
							price: 15,
							attributeValueIds: [attr1Values[1] as string], // Change to match existing-2
						},
					],
				},
				currVariants: [
					{
						id: "existing-1",
						attributeValueIds: [attr1Values[0] as string],
					},
					{
						id: "existing-2",
						attributeValueIds: [attr1Values[1] as string], // Will be duplicated
					},
				],
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA4")).toBe(true);
			}
		});

		it("should detect duplicates regardless of attribute value order", () => {
			const attr1Values = getAttrValues(category, 0);
			const attr2Values = getAttrValues(category, 1);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{
							price: 10,
							attributeValueIds: [
								attr1Values[0] as string,
								attr2Values[0] as string,
							],
						},
						{
							price: 20,
							attributeValueIds: [
								attr2Values[0] as string,
								attr1Values[0] as string,
							], // Same IDs, different order
						},
					],
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA4")).toBe(true);
			}
		});

		it("should pass when update changes to unique combination", () => {
			const attr1Values = getAttrValues(category, 0);

			const result = validateVariants({
				category,
				vOps: {
					update: [
						{
							id: "existing-1",
							price: 15,
							attributeValueIds: [attr1Values[2] as string], // Change to unique value
						},
					],
				},
				currVariants: [
					{
						id: "existing-1",
						attributeValueIds: [attr1Values[0] as string],
					},
					{
						id: "existing-2",
						attributeValueIds: [attr1Values[1] as string],
					},
				],
			});

			expect(result.success).toBe(true);
		});

		it("should handle empty attributeValueIds as valid unique combination", () => {
			const result = validateVariants({
				category,
				vOps: {
					create: [
						{ price: 10, attributeValueIds: [] },
						{ price: 20, attributeValueIds: [] }, // Both empty = duplicate!
					],
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				expect(errors?.subErrors?.some((e) => e.code === "VVA4")).toBe(true);
			}
		});

		it("should not flag existing unchanged variants as duplicates of each other", () => {
			const attr1Values = getAttrValues(category, 0);

			// When we only update price (no attributeValueIds change), existing variants should remain valid
			const result = validateVariants({
				category,
				vOps: {
					update: [
						{
							id: "existing-1",
							price: 25, // Only price change, no attributeValueIds
						},
					],
				},
				currVariants: [
					{
						id: "existing-1",
						attributeValueIds: [attr1Values[0] as string],
					},
					{
						id: "existing-2",
						attributeValueIds: [attr1Values[1] as string],
					},
				],
			});

			expect(result.success).toBe(true);
		});
	});

	describe("Combined validations", () => {
		it("should report multiple error types when multiple violations occur", () => {
			const attr1Values = getAttrValues(category, 0);
			const otherValues = getAttrValues(otherCategory, 0);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{
							price: 10,
							attributeValueIds: [
								otherValues[0] as string, // VVA1: wrong category
								attr1Values[0] as string,
								attr1Values[1] as string, // VVA2: multiple from same attr
							],
						},
						{
							price: 20,
							attributeValueIds: [attr1Values[0] as string], // For VVA4 duplicate test
						},
						{
							price: 30,
							attributeValueIds: [attr1Values[0] as string], // VVA4: duplicate
						},
					],
				},
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				const errorCodes = errors?.subErrors?.map((e) => e.code);
				expect(errorCodes).toContain("VVA1");
				expect(errorCodes).toContain("VVA2");
				expect(errorCodes).toContain("VVA4");
			}
		});

		it("should validate both create and update operations in same call", () => {
			const attr1Values = getAttrValues(category, 0);
			const otherValues = getAttrValues(otherCategory, 0);

			const result = validateVariants({
				category,
				vOps: {
					create: [
						{
							price: 10,
							attributeValueIds: [otherValues[0] as string], // VVA1 in create
						},
					],
					update: [
						{
							id: "existing-1",
							price: 15,
							attributeValueIds: [
								attr1Values[0] as string,
								attr1Values[1] as string, // VVA2 in update
							],
						},
					],
				},
				currVariants: [
					{
						id: "existing-1",
						attributeValueIds: [],
					},
				],
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const errors = result.error.details as ValidationError["details"];
				const createErrors = errors?.subErrors?.filter((e) =>
					e.message.includes("create["),
				);
				const updateErrors = errors?.subErrors?.filter((e) =>
					e.message.includes("update["),
				);
				expect(createErrors?.length).toBeGreaterThanOrEqual(1);
				expect(updateErrors?.length).toBeGreaterThanOrEqual(1);
			}
		});
	});
});
