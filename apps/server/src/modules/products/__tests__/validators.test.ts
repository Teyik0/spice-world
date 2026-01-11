import { describe, expect, it } from "bun:test";
import {
	validateCategoryChangeCapacity,
	validateDuplicateAttributeCombinations,
	validateMaxVariantsForCategory,
} from "../validators/variants";

describe("VVA3: validateMaxVariantsForCategory", () => {
	it("should pass when variant count equals max combinations", () => {
		const result = validateMaxVariantsForCategory(6, [
			{ attributeId: "attr1", valueCount: 2 },
			{ attributeId: "attr2", valueCount: 3 },
		]);
		expect(result.success).toBe(true);
	});

	it("should pass when variant count is less than max combinations", () => {
		const result = validateMaxVariantsForCategory(4, [
			{ attributeId: "attr1", valueCount: 2 },
			{ attributeId: "attr2", valueCount: 3 },
		]);
		expect(result.success).toBe(true);
	});

	it("should fail when variant count exceeds max combinations", () => {
		const result = validateMaxVariantsForCategory(7, [
			{ attributeId: "attr1", valueCount: 2 },
			{ attributeId: "attr2", valueCount: 3 },
		]);
		expect(result.success).toBe(false);
		expect((result as any).error.message).toContain("6 unique combination(s)");
	});

	it("should handle category with no attributes", () => {
		const result = validateMaxVariantsForCategory(1, []);
		expect(result.success).toBe(true);
	});

	it("should fail when >1 variant with no attributes", () => {
		const result = validateMaxVariantsForCategory(2, []);
		expect(result.success).toBe(false);
		expect((result as any).error.message).toContain("1 unique combination(s)");
	});

	it("should calculate correctly for multiple attributes", () => {
		const result = validateMaxVariantsForCategory(24, [
			{ attributeId: "attr1", valueCount: 2 },
			{ attributeId: "attr2", valueCount: 3 },
			{ attributeId: "attr3", valueCount: 4 },
		]);
		expect(result.success).toBe(true);
	});
});

describe("VVA4: validateDuplicateAttributeCombinations", () => {
	it("should pass with unique combinations", () => {
		const result = validateDuplicateAttributeCombinations([
			{ id: "v1", attributeValueIds: ["a1", "b1"] },
			{ id: "v2", attributeValueIds: ["a1", "b2"] },
		]);
		expect(result.success).toBe(true);
	});

	it("should detect duplicate combinations", () => {
		const result = validateDuplicateAttributeCombinations([
			{ id: "v1", attributeValueIds: ["a1", "b1"] },
			{ id: "v2", attributeValueIds: ["b1", "a1"] },
		]);
		expect(result.success).toBe(false);
		expect((result as any).error.message).toContain("v1 and v2");
	});

	it("should detect duplicate combinations with different order", () => {
		const result = validateDuplicateAttributeCombinations([
			{ id: "v1", attributeValueIds: ["c1", "a2", "b3"] },
			{ id: "v2", attributeValueIds: ["b3", "c1", "a2"] },
		]);
		expect(result.success).toBe(false);
	});

	it("should handle variants with no attributes", () => {
		const result = validateDuplicateAttributeCombinations([
			{ id: "v1", attributeValueIds: [] },
			{ id: "v2", attributeValueIds: [] },
		]);
		expect(result.success).toBe(false);
	});

	it("should allow one variant with no attributes", () => {
		const result = validateDuplicateAttributeCombinations([
			{ id: "v1", attributeValueIds: [] },
		]);
		expect(result.success).toBe(true);
	});

	it("should handle new variants without id", () => {
		const result = validateDuplicateAttributeCombinations([
			{ id: "v1", attributeValueIds: ["a1", "b1"] },
			{ attributeValueIds: ["a1", "b1"] },
		]);
		expect(result.success).toBe(false);
		expect((result as any).error.message).toContain("v1 and new variant");
	});

	it("should pass with multiple unique combinations", () => {
		const result = validateDuplicateAttributeCombinations([
			{ id: "v1", attributeValueIds: ["a1", "b1"] },
			{ id: "v2", attributeValueIds: ["a1", "b2"] },
			{ id: "v3", attributeValueIds: ["a2", "b1"] },
			{ id: "v4", attributeValueIds: ["a2", "b2"] },
		]);
		expect(result.success).toBe(true);
	});
});

describe("VVA5: validateCategoryChangeCapacity", () => {
	it("should pass when new category can accommodate variants", () => {
		const result = validateCategoryChangeCapacity(3, [
			{ attributeId: "attr1", valueCount: 2 },
			{ attributeId: "attr2", valueCount: 2 },
		]);
		expect(result.success).toBe(true);
	});

	it("should fail when new category has insufficient capacity", () => {
		const result = validateCategoryChangeCapacity(5, [
			{ attributeId: "attr1", valueCount: 2 },
			{ attributeId: "attr2", valueCount: 2 },
		]);
		expect(result.success).toBe(false);
		expect((result as any).error.message).toContain("5 variant(s)");
		expect((result as any).error.message).toContain("4 combination(s)");
	});

	it("should pass when exact match", () => {
		const result = validateCategoryChangeCapacity(4, [
			{ attributeId: "attr1", valueCount: 2 },
			{ attributeId: "attr2", valueCount: 2 },
		]);
		expect(result.success).toBe(true);
	});

	it("should handle category with no attributes", () => {
		const result = validateCategoryChangeCapacity(1, []);
		expect(result.success).toBe(true);
	});

	it("should fail with >1 variant and no attributes", () => {
		const result = validateCategoryChangeCapacity(2, []);
		expect(result.success).toBe(false);
		expect((result as any).error.message).toContain("1 combination(s)");
	});

	it("should work with single attribute", () => {
		const result = validateCategoryChangeCapacity(3, [
			{ attributeId: "attr1", valueCount: 5 },
		]);
		expect(result.success).toBe(true);
	});
});
