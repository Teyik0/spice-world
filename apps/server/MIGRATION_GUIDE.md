# Guide de Migration: Images Multi-Tailles

Ce guide explique comment migrer vos images existantes du format single-size vers le format multi-tailles sans perte de données.

## 📋 Vue d'Ensemble

**Ancien format:**
```sql
Image {
  key: string      -- Clé UploadThing unique
  url: string      -- URL de l'image (1000x1000)
}
```

**Nouveau format:**
```sql
Image {
  keyThumb: string   -- 128x128px (~5KB)
  keyMedium: string  -- 500x500px (~50KB)
  keyLarge: string   -- 1500x1500px (~200KB)
  urlThumb: string
  urlMedium: string
  urlLarge: string
}
```

## 🚀 Processus de Migration (Production)

### Étape 1: Backup de la Base de Données

**OBLIGATOIRE** avant toute migration !

```bash
# Prisma Postgres
cd apps/server
bunx prisma db push --skip-generate > backup-$(date +%Y%m%d).sql

# Ou via pg_dump si accès direct
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### Étape 2: Appliquer la Migration Safe (Ajoute les Nouvelles Colonnes)

```bash
cd apps/server

# Cette migration AJOUTE les nouveaux champs sans supprimer les anciens
bunx prisma migrate deploy
```

Ou manuellement:
```bash
psql $DATABASE_URL < prisma/migrations/20260128115534_add_multi_size_images_safe/migration.sql
```

✅ **Après cette étape:**
- Votre application continue de fonctionner normalement
- Les anciennes colonnes `key` et `url` existent toujours
- Les nouvelles colonnes sont vides (NULL)

### Étape 3: Tester le Script de Migration (Dry Run)

```bash
cd apps/server

# Voir ce qui serait migré sans faire de changements
bun run src/scripts/migrate-images-to-multi-size.ts --dry-run
```

Sortie attendue:
```
🚀 Image Migration Script
==================================================
Mode: DRY RUN (no changes)
Delete old images: NO
==================================================

📊 Fetching images from database...
✅ Found 42 images to migrate

📋 DRY RUN - Images that would be migrated:
  - abc123: product-image-1.webp
  - def456: product-image-2.webp
  ...

✨ Dry run complete. Run with --execute to perform actual migration.
```

### Étape 4: Exécuter la Migration de Données

```bash
# Migration sans suppression des anciennes images
bun run src/scripts/migrate-images-to-multi-size.ts --execute

# OU avec suppression des anciennes images (économise l'espace UploadThing)
bun run src/scripts/migrate-images-to-multi-size.ts --execute --delete-old
```

**Ce script va:**
1. ⬇️ Télécharger chaque image depuis UploadThing
2. 🔄 Générer 3 tailles (thumb, medium, large)
3. ⬆️ Uploader les 3 nouvelles images
4. 💾 Mettre à jour la DB avec les nouvelles URLs
5. 🗑️ (Optionnel) Supprimer l'ancienne image

**Durée estimée:** ~2-5 secondes par image (selon la taille et la connexion)

Exemple de sortie:
```
[1/42]
📸 Processing image: abc123 (Product: prod-xyz)
  Old key: product-image-1.webp
  Old URL: https://utfs.io/f/product-image-1.webp
  ⬇️  Downloading original image...
  ✅ Downloaded 245.67 KB
  🔄 Generating 3 sizes and uploading...
  ✅ Thumb uploaded: product-image-1-thumb.webp
  ✅ Medium uploaded: product-image-1-medium.webp
  ✅ Large uploaded: product-image-1-large.webp
  💾 Updating database...
  ✅ Database updated

...

==================================================
📊 Migration Summary
==================================================
✅ Successfully migrated: 42
❌ Failed: 0
📊 Total: 42

✨ Migration complete!
```

### Étape 5: Vérifier que Tout Fonctionne

```bash
# Démarrer l'application
cd apps/server && bun run dev
cd apps/web && bun run dev

# Tester:
# - Liste des produits (devrait afficher thumbnails 128px)
# - Détail produit (devrait afficher medium/large)
# - Upload nouvelle image (devrait créer 3 tailles)
```

### Étape 6: Cleanup (Supprimer les Anciennes Colonnes)

**ATTENTION:** Cette étape est irréversible !

```bash
cd apps/server

# Appliquer la migration de cleanup
psql $DATABASE_URL < prisma/migrations/20260128120000_cleanup_old_image_columns/migration.sql
```

Cette migration:
- ✅ Rend les nouvelles colonnes NOT NULL
- ❌ Supprime les colonnes `key` et `url`
- ❌ Supprime l'index `Image_key_key`

### Étape 7: Mettre à Jour le Schema Prisma

Le schema a déjà été mis à jour. Regénérez le client:

```bash
cd apps/server
bunx prisma generate
```

## 🔄 Rollback (Si Problème)

### Avant l'Étape 6 (Cleanup)

Facile ! Les anciennes colonnes existent encore:

```sql
-- Restaurer l'ancien code
git revert <commit-hash>

-- Supprimer les nouvelles colonnes
ALTER TABLE "Image" DROP COLUMN "keyThumb";
ALTER TABLE "Image" DROP COLUMN "keyMedium";
ALTER TABLE "Image" DROP COLUMN "keyLarge";
ALTER TABLE "Image" DROP COLUMN "urlThumb";
ALTER TABLE "Image" DROP COLUMN "urlMedium";
ALTER TABLE "Image" DROP COLUMN "urlLarge";
```

### Après l'Étape 6 (Cleanup)

Restaurez le backup:

```bash
psql $DATABASE_URL < backup-YYYYMMDD.sql
```

## ⚡ Migration Rapide (Dev Only - Perte de Données)

Si vous êtes en développement et que perdre les images n'est pas grave:

```bash
cd apps/server

# Reset complet de la DB
bunx prisma migrate reset

# Ou appliquer la migration destructive
psql $DATABASE_URL < prisma/migrations/20260128115534_add_multi_size_images/migration.sql
```

## 🐛 Résolution de Problèmes

### Erreur: "Failed to download image"

**Cause:** Image supprimée d'UploadThing ou URL invalide

**Solution:**
```sql
-- Lister les images problématiques
SELECT id, key, url FROM "Image" WHERE url NOT LIKE 'https://utfs.io/%';

-- Les supprimer manuellement
DELETE FROM "Image" WHERE id IN ('...');
```

### Erreur: "Upload failed"

**Cause:** Limite UploadThing atteinte ou problème réseau

**Solution:**
- Vérifier votre quota UploadThing
- Relancer le script (il saute les images déjà migrées)

### Certaines images migrées, d'autres non

**Solution:** Relancez simplement le script. Il détecte automatiquement les images déjà migrées:

```sql
-- Le script vérifie si keyThumb est NULL
SELECT COUNT(*) FROM "Image" WHERE "keyThumb" IS NULL;
```

## 📊 Monitoring de la Migration

```sql
-- Voir la progression
SELECT
  COUNT(*) as total,
  COUNT("keyThumb") as migrated,
  COUNT(*) - COUNT("keyThumb") as remaining
FROM "Image";

-- Voir les images non migrées
SELECT id, key, url
FROM "Image"
WHERE "keyThumb" IS NULL;
```

## ✅ Checklist de Migration

- [ ] Backup de la DB effectué
- [ ] Migration safe appliquée (nouvelles colonnes ajoutées)
- [ ] Dry run exécuté avec succès
- [ ] Script de migration exécuté
- [ ] Toutes les images migrées (0 échecs)
- [ ] Application testée (liste + détail produits)
- [ ] Nouvelles images uploadées fonctionnent
- [ ] Migration cleanup appliquée
- [ ] Prisma client regénéré
- [ ] Application redéployée

## 🎯 Coût Estimé

### Espace UploadThing

**Avant:** 100 images × 200KB = 20MB
**Après:** 100 images × (5KB + 50KB + 200KB) = 25.5MB

**Augmentation:** +27.5% d'espace

**Économie bandwidth:** -97.5% pour les listes de produits

### Temps de Migration

| Nombre d'images | Temps estimé | Bande passante |
|-----------------|--------------|----------------|
| 10 images       | ~30 secondes | ~2MB down + 0.5MB up |
| 100 images      | ~5 minutes   | ~20MB down + 5MB up |
| 1000 images     | ~50 minutes  | ~200MB down + 50MB up |

## 📞 Support

En cas de problème:
1. Consultez les logs du script (très détaillés)
2. Vérifiez la section "Résolution de Problèmes"
3. Restaurez le backup si nécessaire

---

**Créé le:** 2026-01-28
**Version:** 1.0.0
