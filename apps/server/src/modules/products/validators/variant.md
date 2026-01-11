---
État Actuel
Déjà existant et inchangé:
- ✅ validateMaxVariantsForCategory (VVA3) - dans validators/variants.ts
- ✅ validateDuplicateAttributeCombinations (VVA4) - alias pour validateV4
- ✅ validateCategoryChangeCapacity (VVA5) - dans validators/variants.ts
Fonctions inchangées:
- validateVariantAttributeValues - VVA1 + VVA2 combinées (déjà créée)
- validateVariantsOps - orchestration pour create/update
---
Changements Requis
1. POST: Ajouter validations pré-upload
Dans service.ts - méthode post:
Phase 2.5: Pré-upload State Validations (NOUVEAU)
Insérer AVANT Phase 3 (Publish Validation):
// Phase 2.5: Pré-upload Variant State Validations
// Valide les variants qui seront créés AVANT upload
const vva3Result = validateMaxVariantsForCategory(
    variants.create?.length || 0,
    category.attributes.map(attr => ({
        attributeId: attr.id,
        valueCount: attr.values.length,
    })),
);
if (!vva3Result.success) {
    throw status("Bad Request", {
        message: vva3Result.error.message,
        code: "VVA3",
    });
}
const vva4Result = validateDuplicateAttributeCombinations(
    variants.create.map(v => ({
        id: `new-${randomLowerString(4)}`,
        attributeValueIds: v.attributeValueIds,
    })),
);
if (!vva4Result.success) {
    throw status("Bad Request", {
        message: vva4Result.error.message,
        code: "VVA4",
    });
}
Pourquoi AVANT upload:
- Évite d'uploader des fichiers inutiles
- Validation VVA4 sur données complètes (tous les variants à créer)
---
2. PATCH: Ajouter validation VVA5 pré-transaction
Dans service.ts - méthode patch:
Phase 2.5: Category Change Validation (NOUVEAU)
Insérer APRÈS "Category change validation" (lignes actuelles 606-633):
// Phase 2.5: Category Change Capacity Validation (VVA5)
// Valide la capacité de la nouvelle catégorie AVANT upload
if (isCategoryChanging) {
    // Calcul du nombre final de variants
    const currentVariantCount = currentProduct._count.variants;
    const deleteCount = variants?.delete?.length ?? 0;
    const createCount = variants?.create?.length ?? 0;
    const finalVariantCount = currentVariantCount - deleteCount + createCount;
    // Construire les attributs de la nouvelle catégorie
    const newCategoryAttributes = newCategory.attributes.map(attr => ({
        attributeId: attr.id,
        valueCount: attr.values.length,
    }));
    const vva5Result = validateCategoryChangeCapacity(
        finalVariantCount,
        newCategoryAttributes,
    );
    if (!vva5Result.success) {
        throw status("Bad Request", {
            message: vva5Result.error.message,
            code: "VVA5",
        });
    }
}
Pourquoi AVANT upload:
- Protection avant upload inutile
- Valide count final (pas seulement initial)
---
Flow Complet Résultant
POST Flow:
Phase 1: Pre-fetch & Validation (parallel)
├── Fetch category
├── validateThumbnailCountForCreate
└── validateImagesOps
Phase 2: Change Detection
Phase 2.5: Pré-upload State Validations ← NOUVEAU
├── validateMaxVariantsForCategory (VVA3)
└── validateDuplicateAttributeCombinations (VVA4)
Phase 3: Publish Validation (PUB1, PUB2)
└── Auto-downgrade logic
Phase 4: File Upload
└── validateAndUploadFiles (maintenant protégé par VVA3/VVA4)
Phase 5: Transaction
├── Créer produit
├── Créer images (uploadées)
├── Créer variants (validés par VVA1/VVA2)
└── PAS de VVA4 post-transaction (déjà fait avant)
PATCH Flow:
Phase 1: Pre-fetch & Validation (parallel)
├── Fetch current product
├── Fetch new category (si change)
├── validateThumbnailCountForCreate
└── validateImagesOps
Phase 2: Change Detection
Phase 2.5: Category Change Validation (VVA5) ← NOUVEAU
└── validateCategoryChangeCapacity (avant upload)
Phase 3: Publish Validation (PUB1, PUB2)
└── Auto-downgrade logic
Phase 4: File Upload
└── validateAndUploadFiles (protégé par VVA5 si category change)
Phase 5: Transaction
├── Mise à jour produit
├── Opérations images
├── Opérations variants (validés par VVA1/VVA2)
└── PAS de VVA4 post-transaction (déjà fait avant upload)
---
Validation de la Proposition
✅ Avantages:
1. Fonctions séparées, claires et testables
2. VVA3/VVA4 exécutés AVANT upload (POST)
3. VVA5 exécuté AVANT upload (PATCH)
4. Pas de duplication de code
5. VVA4 post-transaction reste possible si besoin futur
✅ Invariants respectés:
1. validateVariantsOps inchangée (VVA1, VVA2)
2. validateMaxVariantsForCategory inchangée (VVA3)
3. validateDuplicateAttributeCombinations inchangée (VVA4)
4. validateCategoryChangeCapacity inchangée (VVA5)
✅ Améliorations:
1. Upload protégé par validations pré-transactionnelles
2. Meilleure UX (échoue avant upload long)
3. Code plus lisible (chaque validation à son endroit)
---
À valider avant implémentation
Questions:
1. Pour POST - VVA4: Générer des IDs temporitaires (new-${random})? Ou passer undefined?
2. Pour PATCH - VVA4 post-transaction: La supprimer complètement ou garder pour double-vérification?
3. Import: Les fonctions sont déjà dans validators/variants.ts, pas besoin de changement d'imports
Ce plan vous convient-il pour passer à l'implémentation?
