# Workflow Orchestration Guide for Spice World

Ce document décrit comment utiliser le système d'agents pour exécuter des workflows complets en un seul prompt.

## Architecture des Agents

### Agents Disponibles

| Agent | Rôle | Quand l'utiliser |
|-------|------|------------------|
| `workflow-manager` | Orchestrateur principal | Toutes les tâches complexes |
| `planner` | Analyse et planification | Avant implémentation |
| `backend-coder` | Développement ElysiaJS | Backend, API, modèles |
| `frontend-coder` | Développement React/Next.js | UI, composants, formulaires |
| `test-runner` | Tests intelligents | Validation post-implémentation |
| `qa-reviewer` | Revue finale qualité | Validation finale |
| `database-migration` | Migrations Prisma | Changements de schéma |

### Workflow Détectés Automatiquement

Le `workflow-manager` détecte automatiquement le type de tâche :

#### 1. NEW_FEATURE
**Mots-clés détectés** : "Crée", "Ajoute", "Implémente", "Nouveau système", "Feature"

**Workflow** :
```
Phase 1: Analyse
└─ planner → Plan détaillé

Phase 2: Implémentation Backend
└─ backend-coder → Modèles + Routes + Types

Phase 3: Implémentation Frontend (parallèle si possible)
├─ frontend-coder → Composants + Formulaires
└─ database-migration → Si changement schéma

Phase 4: Validation
└─ test-runner → Tests intelligents
└─ qa-reviewer → Revue finale
```

#### 2. REFACTORING
**Mots-clés détectés** : "Refactor", "Optimise", "Améliore", "Réduit duplication", "Performance", "Clean up"

**Workflow** :
```
Phase 1: Analyse
└─ planner → Opportunités d'optimisation

Phase 2: Refactoring (PARALLÈLE)
├─ backend-coder → Optimisation backend
└─ frontend-coder → Optimisation frontend

Phase 3: Validation
└─ test-runner → Vérifier pas de régression
└─ qa-reviewer → Qualité du refactoring
```

#### 3. BUGFIX
**Mots-clés détectés** : "Corrige", "Fix", "Résouds", "Bug", "Erreur"

**Workflow** :
```
Phase 1: Analyse
└─ planner → Analyse root cause

Phase 2: Correction
└─ backend-coder OU frontend-coder → Fix

Phase 3: Validation
└─ test-runner → Tests + test régression
└─ qa-reviewer → Validation fix
```

## Exemples de Prompts One-Shot

### 🛍️ Nouvelle Feature Complète

```
Crée un système de reviews produits complet avec :
- Backend : modèles Prisma (Review avec rating, commentaire, userId, productId),
  routes API CRUD (POST, GET, PATCH, DELETE),
  tests complets
- Frontend : composant ReviewCard, formulaire d'ajout de review,
  liste des reviews sur la page produit, validation des formulaires
- Assure la cohérence des types entre backend et frontend
- Tests automatiques pour toutes les routes
```

**Ce qui se passe** :
1. workflow-manager détecte "Crée" + "système" → Workflow NEW_FEATURE
2. planner analyse et planifie
3. backend-coder crée les modèles et routes
4. database-migration gère la migration Prisma
5. frontend-coder crée les composants (en parallèle avec backend si possible)
6. test-runner exécute tests intelligents (uniquement fichiers modifiés)
7. qa-reviewer valide la qualité finale

### 🔄 Refactoring

```
Refactor le module des commandes (orders) pour :
- Réduire la duplication de code dans les services
- Améliorer la gestion des erreurs
- Rendre les transactions plus atomiques
- Optimiser les performances des requêtes Prisma
- Maintenir toutes les fonctionnalités existantes
```

**Ce qui se passe** :
1. workflow-manager détecte "Refactor" → Workflow REFACTORING
2. planner identifie les opportunités d'optimisation
3. backend-coder refactorise (plusieurs fichiers en parallèle)
4. test-runner vérifie qu'aucun test ne casse
5. qa-reviewer valide la qualité et la performance

### 🐛 Bugfix

```
Corrige le bug où les attributs de produit ne se mettent pas à jour 
lors de l'édition. Le problème semble être dans la route PATCH 
/products/:id - les attributs sont ignorés lors de la mise à jour.
```

**Ce qui se passe** :
1. workflow-manager détecte "Corrige" + "bug" → Workflow BUGFIX
2. planner analyse le code pour identifier la root cause
3. backend-coder corrige la route PATCH
4. test-runner ajoute un test de régression + vérifie les tests existants
5. qa-reviewer valide le fix

### 📦 Feature avec Migration

```
Ajoute un système de tags pour les produits avec :
- Nouveau modèle Tag avec relation many-to-many avec Product
- Routes API pour gérer les tags (CRUD)
- Interface admin pour créer/assigner des tags
- Filtre par tag sur la liste des produits
```

**Ce qui se passe** :
1. workflow-manager détecte la migration nécessaire ("Nouveau modèle")
2. planner planifie avec migration
3. database-migration crée et applique la migration Prisma
4. backend-coder crée les routes et modèles
5. frontend-coder crée l'interface admin et les filtres
6. test-runner exécute FULL test suite (migration = full suite requis)
7. qa-reviewer valide tout

### 🎨 Frontend Seul

```
Crée un dashboard analytics pour les commandes avec :
- Graphiques des ventes par période (utilise recharts)
- KPIs principaux (revenus, nombre de commandes, panier moyen)
- Filtres par date et catégorie
- Design responsive et moderne
```

**Ce qui se passe** :
1. workflow-manager détecte "dashboard" + "analytics" → Frontend seul possible
2. planner planifie l'interface
3. frontend-coder crée le dashboard (utilise frontend-design skill automatiquement)
4. test-runner vérifie les tests frontend
5. qa-reviewer valide la qualité UI/UX

## Stratégie de Test Intelligente

Le `test-runner` exécute automatiquement la stratégie optimale :

### Tests Sélectifs (par défaut)
```
Fichiers modifiés détectés :
  - apps/server/src/routes/products.ts
  
Tests exécutés :
  ✅ apps/server/tests/routes/products.test.ts
  
Tests ignorés (non impactés) :
  ⏭️ apps/server/tests/routes/orders.test.ts
  ⏭️ apps/server/tests/routes/users.test.ts
```

### Full Suite (conditions spéciales)
```
Changements détectés :
  - prisma/schema.prisma (MODIFICATION SCHÉMA)
  
⚠️  Migration de schéma détectée
🔄 Exécution de la FULL test suite nécessaire

Tests exécutés :
  ✅ apps/server/tests/**/*.test.ts (45 tests)
  ✅ apps/web/tests/**/*.test.tsx (32 tests)
  
Temps total : 45s
```

## Règles d'Exécution Parallèle

### ✅ Peuvent s'exécuter en PARALLÈLE :
- backend-coder + frontend-coder (si pas de dépendance de types)
- test-runner + database-migration (après backend)
- Multiple fichiers backend indépendants
- Multiple composants frontend indépendants

### ❌ Doivent s'exécuter en SÉQUENTIEL :
- planner → implementation (dépendance logique)
- backend routes → frontend components (types API nécessaires)
- test-runner → qa-reviewer (tests doivent passer avant QA)
- database-migration → test-runner (migration avant tests)

## Critères de Succès

Un workflow est considéré comme **RÉUSSI** quand :

✅ **Implementation**
- Code suivant les patterns du projet
- Pas de duplication de types
- Atomicité respectée (transactions)
- Bun-first rule respectée

✅ **Tests**
- Tous les tests sélectionnés passent
- Pas de régression
- Coverage maintenu ou amélioré

✅ **Qualité**
- TypeScript sans erreurs
- Linting (biome) passe
- Code review validée
- Pas de bugs évidents

## Gestion des Erreurs

### Si un agent échoue :

1. **test-runner échoue**
   - workflow-manager capture l'erreur
   - Redélégue au bon agent (backend ou frontend) pour correction
   - Relance test-runner après correction

2. **qa-reviewer bloque**
   - Rapporte les problèmes spécifiques
   - workflow-manager redélégue pour corrections
   - Re-validation par qa-reviewer

3. **database-migration échoue**
   - Analyse l'erreur
   - Corrige le schéma si nécessaire
   - Réessaie la migration

## Workflow Avancés

### Feature Complexe Multi-Étapes

```
Implémente un système complet de gestion des stocks avec :

PHASE 1 - Modèles de base :
- Modèle Inventory avec quantité, seuil d'alerte
- Relations avec Product

PHASE 2 - Backend :
- Routes pour mettre à jour les stocks
- Calcul automatique du stock disponible
- Alertes quand stock < seuil

PHASE 3 - Frontend :
- Page de gestion des stocks
- Indicateurs de stock faible
- Formulaire d'ajustement de stock

PHASE 4 - Automatisation :
- Mise à jour auto du stock lors des commandes
- Notifications email quand stock critique

Attends la validation de chaque phase avant de passer à la suivante.
```

### Refactoring avec Migration

```
Refactor la gestion des catégories pour supporter les catégories
hiérarchiques (parent/enfant) :

1. Migration : Ajoute colonne parentId à Category
2. Backend : 
   - Met à jour les routes pour gérer la hiérarchie
   - Ajoute validation (pas de cycles)
   - Optimise les requêtes récursives
3. Frontend :
   - Met à jour l'arbre des catégories
   - Formulaire avec sélection parent
   - Navigation hiérarchique
4. Tests :
   - Vérifie pas de régression
   - Ajoute tests pour la hiérarchie
```

## Personnalisation

### Modifier un Workflow

Pour ajuster le comportement par défaut, mentionnez-le dans le prompt :

```
Crée un système de coupons de réduction mais :
- Exécute les étapes backend et frontend séquentiellement 
  (pas en parallèle) car j'ai besoin de valider l'API d'abord
- Force le test complet après migration
- Skip la QA review à la fin
```

### Override des Agents

Pour forcer un agent spécifique :

```
Utilise backend-coder pour créer les routes mais force l'utilisation 
de database-migration AVANT d'exécuter les tests.
```

## Monitoring

Le workflow-manager rapporte automatiquement :

```
🚀 Workflow Lancé: NEW_FEATURE

📋 Phase 1/4: Analyse
   └─ planner → ✅ Complété (15s)

🔧 Phase 2/4: Implémentation Backend  
   └─ backend-coder → ✅ Complété (2m 30s)

🎨 Phase 3/4: Implémentation Frontend (PARALLÈLE)
   ├─ frontend-coder → ✅ Complété (1m 45s)
   └─ database-migration → ✅ Complété (30s)

✅ Phase 4/4: Validation
   ├─ test-runner → ✅ 12 tests passés (8s)
   └─ qa-reviewer → ✅ Approuvé

⏱️  Temps total: 5m 08s
✨ Statut: RÉUSSI - Feature prête pour production
```

## Tips & Best Practices

### ✅ Faire :
- Être spécifique sur ce que vous voulez
- Mentionner les dépendances si vous les connaissez
- Demander explicitement les étapes séquentielles si nécessaire
- Spécifier les patterns à suivre

### ❌ Éviter :
- Prompts trop vagues ("Améliore le code")
- Demander plusieurs features non liées en un prompt
- Sauter la validation (tests + QA)
- Oublier de mentionner les contraintes métier importantes

## Support

Si un workflow ne fonctionne pas comme prévu :
1. Vérifiez le message d'erreur
2. Demandez explicitement l'agent qui a échoué
3. Fournissez plus de contexte sur ce qui est attendu
4. Séparez en plusieurs prompts plus petits si nécessaire

---

**Pro Tip** : Commencez avec des prompts simples et ajoutez de la complexité progressivement. Le système est conçu pour apprendre de vos préférences au fil du temps.
