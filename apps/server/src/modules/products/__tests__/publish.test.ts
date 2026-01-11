import { describe, expect, it } from "bun:test";
import {
	computeFinalVariantCount,
	countVariantsWithAttributeValues,
	determineStatusAfterCategoryChange,
	validatePublishAttributeRequirements,
	validatePublishHasPositivePrice,
} from "../validators/publish";

describe("validatePublishHasPositivePrice (PUB1)", () => {
	it("should return invalid when all current variants have price = 0", () => {
		const result = validatePublishHasPositivePrice({
			currentVariants: [{ id: "v1", price: 0 }],
		});

		expect(result.success).toBe(false);
		expect((result as any).error.message).toContain("price");
	});

	it("should return valid when at least one variant has price > 0", () => {
		const result = validatePublishHasPositivePrice({
			currentVariants: [
				{ id: "v1", price: 0 },
				{ id: "v2", price: 5.99 },
			],
		});

		expect(result.success).toBe(true);
	});

	it("should consider update operations that set price to 0", () => {
		const result = validatePublishHasPositivePrice({
			currentVariants: [{ id: "v1", price: 5.99 }],
			variantsToUpdate: [{ id: "v1", price: 0 }],
		});

		expect(result.success).toBe(false);
	});

	it("should consider create operations with price > 0", () => {
		const result = validatePublishHasPositivePrice({
			currentVariants: [{ id: "v1", price: 0 }],
			variantsToCreate: [{ price: 10 }],
		});

		expect(result.success).toBe(true);
	});

	it("should exclude deleted variants from validation", () => {
		const result = validatePublishHasPositivePrice({
			currentVariants: [
				{ id: "v1", price: 5.99 },
				{ id: "v2", price: 0 },
			],
			variantsToDelete: ["v1"],
		});

		expect(result.success).toBe(false);
	});

	it("should handle complex scenario: delete + create + update", () => {
		const result = validatePublishHasPositivePrice({
			currentVariants: [
				{ id: "v1", price: 10 },
				{ id: "v2", price: 5 },
			],
			variantsToDelete: ["v1"],
			variantsToUpdate: [{ id: "v2", price: 0 }],
			variantsToCreate: [{ price: 0 }],
		});

		expect(result.success).toBe(false);
	});

	it("should return valid with only new variants having price > 0", () => {
		const result = validatePublishHasPositivePrice({
			currentVariants: [],
			variantsToCreate: [{ price: 9.99 }],
		});

		expect(result.success).toBe(true);
	});
});

describe("validatePublishAttributeRequirements (PUB2)", () => {
	it("should allow single variant without attributes", () => {
		const result = validatePublishAttributeRequirements({
			categoryHasAttributes: true,
			currentVariants: [{ id: "v1", attributeValueIds: [] }],
		});

		expect(result.success).toBe(true);
	});

	it("should reject multiple variants without attributes when category has attributes", () => {
		const result = validatePublishAttributeRequirements({
			categoryHasAttributes: true,
			currentVariants: [
				{ id: "v1", attributeValueIds: [] },
				{ id: "v2", attributeValueIds: [] },
			],
		});

		expect(result.success).toBe(false);
		expect((result as any).error.message).toContain("distinguishable");
	});

	it("should reject multiple variants when category has no attributes", () => {
		const result = validatePublishAttributeRequirements({
			categoryHasAttributes: false,
			currentVariants: [
				{ id: "v1", attributeValueIds: [] },
				{ id: "v2", attributeValueIds: [] },
			],
		});

		expect(result.success).toBe(false);
		expect((result as any).error.message).toContain("no attributes");
	});

	it("should allow multiple variants when all have attributes", () => {
		const result = validatePublishAttributeRequirements({
			categoryHasAttributes: true,
			currentVariants: [
				{ id: "v1", attributeValueIds: ["av1"] },
				{ id: "v2", attributeValueIds: ["av2"] },
			],
		});

		expect(result.success).toBe(true);
	});

	it("should reject when update removes attributes from variant", () => {
		const result = validatePublishAttributeRequirements({
			categoryHasAttributes: true,
			currentVariants: [
				{ id: "v1", attributeValueIds: ["av1"] },
				{ id: "v2", attributeValueIds: ["av2"] },
			],
			variantsToUpdate: [{ id: "v1", attributeValueIds: [] }],
		});

		expect(result.success).toBe(false);
	});

	it("should allow single variant in no-attribute category", () => {
		const result = validatePublishAttributeRequirements({
			categoryHasAttributes: false,
			currentVariants: [{ id: "v1", attributeValueIds: [] }],
		});

		expect(result.success).toBe(true);
	});

	it("should consider create operations", () => {
		const result = validatePublishAttributeRequirements({
			categoryHasAttributes: true,
			currentVariants: [{ id: "v1", attributeValueIds: ["av1"] }],
			variantsToCreate: [{ attributeValueIds: [] }],
		});

		expect(result.success).toBe(false);
	});

	it("should exclude deleted variants", () => {
		const result = validatePublishAttributeRequirements({
			categoryHasAttributes: true,
			currentVariants: [
				{ id: "v1", attributeValueIds: ["av1"] },
				{ id: "v2", attributeValueIds: [] },
			],
			variantsToDelete: ["v2"],
		});

		expect(result.success).toBe(true);
	});
});

describe("determineStatusAfterCategoryChange", () => {
	it("should not auto-draft single variant products", () => {
		const result = determineStatusAfterCategoryChange({
			currentStatus: "PUBLISHED",
			requestedStatus: "PUBLISHED",
			newCategoryHasAttributes: true,
			finalVariantCount: 1,
			variantsWithAttributeValues: 0,
		});

		expect(result).toBe("PUBLISHED");
	});

	it("should auto-draft when multiple variants lack attributes", () => {
		const result = determineStatusAfterCategoryChange({
			currentStatus: "PUBLISHED",
			requestedStatus: "PUBLISHED",
			newCategoryHasAttributes: true,
			finalVariantCount: 2,
			variantsWithAttributeValues: 0,
		});

		expect(result).toBe("DRAFT");
	});

	it("should auto-draft when new category has no attributes and multiple variants", () => {
		const result = determineStatusAfterCategoryChange({
			currentStatus: "PUBLISHED",
			requestedStatus: "PUBLISHED",
			newCategoryHasAttributes: false,
			finalVariantCount: 2,
			variantsWithAttributeValues: 0,
		});

		expect(result).toBe("DRAFT");
	});

	it("should preserve PUBLISHED when all variants have attributes", () => {
		const result = determineStatusAfterCategoryChange({
			currentStatus: "PUBLISHED",
			requestedStatus: "PUBLISHED",
			newCategoryHasAttributes: true,
			finalVariantCount: 2,
			variantsWithAttributeValues: 2,
		});

		expect(result).toBe("PUBLISHED");
	});

	it("should use current status when no requested status", () => {
		const result = determineStatusAfterCategoryChange({
			currentStatus: "DRAFT",
			requestedStatus: undefined,
			newCategoryHasAttributes: true,
			finalVariantCount: 1,
			variantsWithAttributeValues: 0,
		});

		expect(result).toBe("DRAFT");
	});
});

describe("computeFinalVariantCount", () => {
	it("should compute correctly with creates and deletes", () => {
		const result = computeFinalVariantCount(
			3,
			[{ price: 1 }, { price: 2 }],
			["v1"],
		);

		expect(result).toBe(4); // 3 - 1 + 2
	});

	it("should handle empty operations", () => {
		const result = computeFinalVariantCount(5, undefined, undefined);

		expect(result).toBe(5);
	});
});

describe("countVariantsWithAttributeValues", () => {
	it("should count variants with attributes correctly", () => {
		const result = countVariantsWithAttributeValues(
			[
				{ id: "v1", attributeValueIds: ["av1"] },
				{ id: "v2", attributeValueIds: [] },
			],
			[{ attributeValueIds: ["av3"] }],
			undefined,
			undefined,
		);

		expect(result).toBe(2); // v1 + new variant
	});

	it("should exclude deleted variants", () => {
		const result = countVariantsWithAttributeValues(
			[
				{ id: "v1", attributeValueIds: ["av1"] },
				{ id: "v2", attributeValueIds: ["av2"] },
			],
			undefined,
			undefined,
			["v1"],
		);

		expect(result).toBe(1); // only v2 remains
	});

	it("should consider updates", () => {
		const result = countVariantsWithAttributeValues(
			[
				{ id: "v1", attributeValueIds: [] },
				{ id: "v2", attributeValueIds: ["av2"] },
			],
			undefined,
			[{ id: "v1", attributeValueIds: ["av1"] }],
			undefined,
		);

		expect(result).toBe(2); // v1 now has attrs via update
	});
});
