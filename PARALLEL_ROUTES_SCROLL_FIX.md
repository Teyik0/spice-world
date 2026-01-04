# Fix: Parallel Routes Scroll Position & Filter Reset

## Requirements

1. ✅ Navigation entre produits → **Scroll préservé** (pas de remount)
2. ✅ Changement de filtres → **Produits remplacés** (remount OK) + scroll au top
3. ✅ **SSR maintenu** - searchParams accessibles côté serveur
4. ✅ **Pas de save/restore manuel** du scroll (cause layout shift)
5. ✅ Infinite scroll fonctionne correctement

## Problème

- **Navigation entre produits** (`/products` → `/products/[slug]`) : La sidebar perd sa position de scroll (remonte au top 1 er product) 
- **Changement de filtres** (ex: `status=DRAFT` → `status=PUBLISHED`) : Le changement de filtre ne provoque pas le re-render de l'initialProduct list (1er call SSR), bien que les nouveaux produits soient fetchés côté serveur.

## Root Cause Découvert

### Bug Next.js avec Parallel Routes

Documentation officielle Next.js :
> "During client-side navigation, Next.js will perform a partial render, changing the subpage within the slot, while maintaining the other slot's active subpages, **even if they don't match the current URL**."

Source: https://nextjs.org/docs/app/building-your-application/routing/parallel-routes

**Problème identifié** :
- `default.tsx` est un **fallback passif** qui ne re-render pas activement
- Les props du Server Component ne sont pas passées au Client Component lors des changements de `searchParams`
- `page.tsx` et `[slug]/page.tsx` séparés causent des remounts lors de navigation

### Logs révélateurs

```
🟠 SERVER: Products fetched { firstProductId: "faddcae4-..." }  ← Serveur a les NOUVEAUX
[browser] ProductsSidebar { productsCount: 25 }  ← Client garde les ANCIENS
🟣 useLayoutEffect checks { productsChanged: false, refEquality: true }  ← React ne voit pas le changement!
```

React comparaît `prevInitialProducts.current === initialProducts` → `true` même si le contenu est différent (Next.js ne passe pas les nouvelles props).

## Solutions Testées (Échecs)

### ❌ Tentative 1: useLayoutEffect avec filterSignature
```tsx
useLayoutEffect(() => {
  if (filtersChanged && productsChanged) {
    setPages([initialProducts]);
  }
}, [filterSignature, initialProducts]);
```
**Échec** : `productsChanged` reste toujours `false` car les refs ne changent pas.

### ❌ Tentative 2: Key prop sur ProductsSidebar dans default.tsx
```tsx
const key = JSON.stringify(params);
return <ProductsSidebar key={key} />;
```
**Échec** : `default.tsx` ne re-render pas, la key ne change jamais.

### ❌ Tentative 3: page.tsx + [slug]/page.tsx séparés
```
@sidebar/
  ├── page.tsx
  └── [slug]/page.tsx
```
**Échec** : Remount à chaque navigation → scroll perdu.

### ❌ Tentative 4: [[...slug]] avec key={filterKey}
```tsx
// @sidebar/[[...slug]]/page.tsx
const filterKey = JSON.stringify({ status, name, categories, sortBy, sortDir });
return <ProductsSidebar key={filterKey} />;
```
**Échec** : 
- Scroll préservé ✅
- MAIS : Rendu avec 1 cran de retard ❌
- Changement de filtre → Le refetch ne se fait qu'au prochain changement
- UI pas mise à jour immédiatement
- **Root cause** : La `key` force un remount même lors de navigation, créant des problèmes de timing

### ❌ Tentative 5: [[...slug]] avec détection via params
```tsx
const prevParamsRef = useRef(params);
useEffect(() => {
  if (prevParamsRef.current !== params) {
    setPages([initialProducts]);
  }
}, [params]);
```
**Échec** : `params` comparé par référence (objet) → Ne détecte pas toujours les changements

### ❌ Tentative 6: [[...slug]] avec signature via premier produit ID
```tsx
const currentSignature = initialProducts[0]?.id || "empty";
const prevSignature = useRef(currentSignature);
useEffect(() => {
  if (prevSignature.current !== currentSignature) {
    setPages([initialProducts]);
  }
}, [currentSignature]);
```
**Échec** : Scroll state pas préservé lors de la navigation entre produits

## ✅ Solution Finale

### Structure avec Optional Catch-All Routes

```
products/
  ├── layout.tsx
  ├── @sidebar/
  │   └── [[...slug]]/
  │       └── page.tsx    ← Match /products ET /products/[slug]
  └── @main/
      └── [[...slug]]/
          └── page.tsx    ← Match /products ET /products/[slug]
```

### Code

**`@sidebar/[[...slug]]/page.tsx`**
```tsx
export default async function ProductsSidebarSlot({ searchParams }) {
  const params = productsSearchParamsCache.parse(await searchParams);
  
  const [{ data: products }, { data: categories }] = await Promise.all([
    app.products.get({ query: { ...params } }),
    app.categories.get(),
  ]);

  // ✅ Key basée UNIQUEMENT sur les filtres (PAS sur le slug)
  const filterKey = JSON.stringify({
    status: params.status,
    name: params.name,
    categories: params.categories,
    sortBy: params.sortBy,
    sortDir: params.sortDir,
  });

  return (
    <ProductsSidebar
      key={filterKey}  // ← Force remount seulement quand filtres changent
      initialProducts={products ?? []}
      categories={categories ?? []}
    />
  );
}
```

**`use-products-infinite.ts`** (simplifié)
```tsx
export function useProductsInfinite(initialProducts) {
  const [params] = useQueryStates(productsSearchParams);
  const [pages, setPages] = useState([initialProducts]);
  // ... infinite scroll logic (pas de useLayoutEffect complexe)
}
```

### Pourquoi ça marche

1. **`[[...slug]]`** : Route optionnelle catch-all → même page pour `/products` et `/products/[slug]`
2. **Pas de remount lors navigation** : Le composant reste monté, scroll préservé naturellement
3. **Remount sur filtres** : `key={filterKey}` change → React remount → nouveau state frais
4. **SSR maintenu** : Server Component fetch les produits avec searchParams
5. **Props passées correctement** : Route active (pas fallback) → Next.js passe les props

## Tests de Validation

### Test 1: Navigation préserve scroll
1. Ouvrir `/products`
2. Scroller vers le bas (ex: produit 20/25)
3. Cliquer sur un produit → `/products/[slug]`
4. **Résultat attendu** : Scroll position identique

### Test 2: Filtres remplacent produits
1. Afficher 25 produits DRAFT
2. Scroller → Infinite scroll charge 50 produits
3. Changer filtre → `status=PUBLISHED`
4. **Résultat attendu** : 25 produits PUBLISHED (pas 75)

### Test 3: Infinite scroll fonctionne
1. Afficher produits
2. Scroller en bas
3. **Résultat attendu** : Nouvelles pages chargées (25 → 50 → 75)

## Configuration Next.js

**Version testée** : Next.js 15+ (App Router)

**Fichiers modifiés** :
- ✅ Créé `@sidebar/[[...slug]]/page.tsx`
- ✅ Créé `@main/[[...slug]]/page.tsx`
- ✅ Supprimé `@sidebar/default.tsx`
- ✅ Supprimé `@sidebar/page.tsx` et `@sidebar/[slug]/page.tsx`
- ✅ Simplifié `use-products-infinite.ts` (retiré useLayoutEffect)

## Références

- [Next.js Parallel Routes](https://nextjs.org/docs/app/building-your-application/routing/parallel-routes)
- [GitHub Issue: SearchParams not updating](https://github.com/vercel/next.js/issues/62451)
- [Optional Catch-all Routes](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes#optional-catch-all-segments)
