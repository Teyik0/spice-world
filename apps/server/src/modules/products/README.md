# Module Products

## Architecture

```
products/
  |-- service.ts          # Orchestration principale
  |-- model.ts            # Schémas TypeBox
  |-- index.ts            # Routes Elysia
  |-- validators/
  |     |-- index.ts      # Exports
  |     |-- publish.ts    # Règles PUB1, PUB2, auto-draft
  |     |-- variants.ts   # Validation attributs variants
  |     |-- images.ts     # Validation opérations images
  |-- operations/
  |     |-- index.ts      # Exports
  |     |-- images.ts     # CRUD images (transaction)
  |     |-- variants.ts   # CRUD variants (transaction)
```

## Codes d'Erreur

### Publication (Nouveaux)

| Code | HTTP | Description |
|------|------|-------------|
| PUB1 | 400 | Cannot publish: no variant with price > 0 |
| PUB2 | 400 | Cannot publish: variants missing attribute values OR too many variants for no-attribute category |

### Validation Variants

| Code | HTTP | Description |
|------|------|-------------|
| VVA1 | 400 | Invalid attribute values for variant (wrong category) |
| VVA2 | 400 | Multiple values for same attribute in variant |
| VARIANT_NOT_FOUND | 404 | Variant ID not found in product |
| INSUFFICIENT_VARIANTS | 400 | Product must have at least 1 variant |

### Validation Images

| Code | HTTP | Description |
|------|------|-------------|
| VIO1 | 400 | Duplicate fileIndex in imagesOps.create |
| VIO2 | 400 | Multiple thumbnails in imagesOps.create |
| VIO3 | 400 | Duplicate fileIndex in imagesOps.update |
| VIO4 | 400 | Multiple thumbnails in imagesOps.update |
| VIO5 | 400 | fileIndex used in both create and update |
| VIO6 | 400 | Multiple thumbnails across create and update |
| VIO7 | 400 | fileIndex out of bounds |
| IMAGE_NOT_FOUND | 404 | Image ID not found in product |
| POST_MULTIPLE_THUMBNAILS | 400 | Only one thumbnail allowed at creation |

### Changement de Catégorie

| Code | HTTP | Description |
|------|------|-------------|
| CATEGORY_CHANGE_REQUIRES_VARIANTS | 400 | Category change requires variant operations |
| CATEGORY_CHANGE_REQUIRES_DELETE_ALL | 400 | Must delete ALL existing variants when changing category |
| CATEGORY_CHANGE_REQUIRES_CREATE | 400 | Must create at least one new variant when changing category |
| CATEGORY_NOT_FOUND | 400 | Category ID not found |

### Autres

| Code | HTTP | Description |
|------|------|-------------|
| Conflict | 409 | Version mismatch (optimistic locking) |

## Règles de Publication

### PUB1: Prix Minimum

Un produit ne peut être PUBLISHED que si **au moins un variant a un prix > 0**.

### PUB2: Attributs pour Variants Multiples

- Si le produit a **>1 variant**, chaque variant **doit** avoir des attributeValues
- Corollaire: Une catégorie **sans attributs** ne peut avoir qu'**1 seul variant** en PUBLISHED
- En DRAFT: pas de restriction (on peut avoir plusieurs variants sans attributs)

### Auto-DRAFT sur Changement de Catégorie

Lors d'un changement de catégorie:
- Si >1 variant ET attributeValues manquants → status forcé à DRAFT
- Exception: 1 seul variant → pas d'auto-draft

### Auto-DRAFT sur POST

Lors de la création d'un produit avec `status: PUBLISHED`:
- Si les règles PUB1 ou PUB2 ne sont pas respectées → status automatiquement mis à DRAFT
- Le frontend doit afficher un warning pour informer l'utilisateur

## Cas d'Usage

| Situation | Status actuel | Action | Résultat |
|-----------|---------------|--------|----------|
| Créer produit avec price=0 | - | POST status=PUBLISHED | Auto-DRAFT |
| Créer produit avec price>0 | - | POST status=PUBLISHED | PUBLISHED |
| Créer produit price>0, 2 variants sans attrs | - | POST status=PUBLISHED | Auto-DRAFT (PUB2) |
| Update price à 0 | PUBLISHED | PATCH price=0 | REJETER (PUB1) |
| Update price à 0 | PUBLISHED | PATCH price=0, status=DRAFT | OK → DRAFT |
| Update price à 0 | DRAFT | PATCH price=0 | OK |
| Ajouter variant sans attrs | PUBLISHED (1 variant) | PATCH create variant | REJETER (PUB2) |
| Ajouter variant sans attrs | DRAFT | PATCH create variant | OK |
| Supprimer seul variant price>0 | PUBLISHED (2 variants) | PATCH delete variant | REJETER (PUB1) |
| Changer catégorie | PUBLISHED | PATCH categoryId | Auto-DRAFT si attrs manquants |
| Changer catégorie | PUBLISHED (1 variant) | PATCH categoryId | OK (exception 1 variant) |
| Publier 2 variants, catégorie sans attrs | DRAFT | PATCH status=PUBLISHED | REJETER (PUB2) |
| Publier 1 variant, catégorie sans attrs | DRAFT | PATCH status=PUBLISHED | OK |
| Bulk publish | Multiple | bulkPatch status=PUBLISHED | Chaque produit validé PUB1/PUB2 |

## Logique de Validation

### Quand valider PUB1/PUB2?

```
SI (status demandé == PUBLISHED) OU (status actuel == PUBLISHED ET pas de changement de status):
  - Calculer l'état final des variants (après create/update/delete)
  - Valider PUB1: au moins un variant avec price > 0
  - Valider PUB2: si >1 variant, tous doivent avoir des attributeValues
  - SI validation échoue → REJETER avec erreur 400

SI changement de catégorie:
  - Vérifier si les nouveaux variants ont des attributeValues
  - SI >1 variant ET attributeValues manquants → forcer status = DRAFT (pas d'erreur)
```

## Exemples d'API

### POST - Créer un produit

```typescript
// Création avec publication automatique réussie
POST /products
{
  name: "Paprika",
  description: "...",
  categoryId: "cat-123",
  status: "PUBLISHED",
  variants: {
    create: [
      { price: 5.99, attributeValueIds: ["av-100g"] }
    ]
  },
  imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] }
}
// → Retourne produit avec status: "PUBLISHED"

// Création avec auto-draft (price = 0)
POST /products
{
  name: "Paprika",
  status: "PUBLISHED",
  variants: {
    create: [{ price: 0, attributeValueIds: [] }]
  }
}
// → Retourne produit avec status: "DRAFT" (PUB1 non respecté)
```

### PATCH - Mettre à jour un produit

```typescript
// Update qui casse un produit PUBLISHED → REJETÉ
PATCH /products/prod-123
{
  variants: {
    update: [{ id: "var-1", price: 0 }]
  }
}
// → 400 Bad Request { code: "PUB1", message: "Cannot publish: at least one variant must have price > 0" }

// Update avec demande explicite de DRAFT → OK
PATCH /products/prod-123
{
  status: "DRAFT",
  variants: {
    update: [{ id: "var-1", price: 0 }]
  }
}
// → OK, produit passe en DRAFT
```
