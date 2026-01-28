import type { ProductStatus } from "@spice-world/server/db";

export interface ValidationResults {
	priceValid: boolean;
	attributesValid: boolean;
}

export function setFinalStatus({
	requestedStatus,
	validationResults,
}: {
	requestedStatus: ProductStatus;
	validationResults: ValidationResults;
}): ProductStatus {
	if (
		requestedStatus === "PUBLISHED" &&
		!(validationResults.priceValid && validationResults.attributesValid)
	) {
		return "DRAFT";
	}
	return requestedStatus;
}
