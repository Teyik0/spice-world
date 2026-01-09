import { status } from "elysia";

export interface AllowedAttributeValue {
	id: string;
	attributeId: string;
}

export function validateVariantAttributeValues(
	variantSkuOrId: string,
	attributeValueIds: string[] | undefined,
	allowedAttributeValues: AllowedAttributeValue[],
) {
	if (!attributeValueIds || attributeValueIds.length === 0) return;

	const allowedIds = new Set(allowedAttributeValues.map((a) => a.id));
	const invalidIds = attributeValueIds.filter((id) => !allowedIds.has(id));

	if (invalidIds.length > 0) {
		throw status("Bad Request", {
			message: `Invalid attribute values for variant ${variantSkuOrId}: ${invalidIds.join(
				", ",
			)}. Attribute values should match product category.`,
			code: "VVA1",
		});
	}

	const attributeIdMap = new Map<string, string>();

	for (const valueId of attributeValueIds) {
		const attrValue = allowedAttributeValues.find((a) => a.id === valueId);
		if (!attrValue) continue;

		const existingValueId = attributeIdMap.get(attrValue.attributeId);
		if (existingValueId) {
			throw status("Bad Request", {
				message: `Variant ${variantSkuOrId} has multiple values for the same attribute. Found both ${existingValueId} and ${valueId}.`,
				code: "VVA2",
			});
		}

		attributeIdMap.set(attrValue.attributeId, valueId);
	}
}
