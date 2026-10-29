import type { ProductStatus } from "@spice-world/server/prisma/client";

export interface ValidationResults {
  attributesValid: boolean;
  priceValid: boolean;
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
