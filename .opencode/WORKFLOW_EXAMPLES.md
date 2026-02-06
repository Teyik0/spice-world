# Workflow Examples

Ce document montre des exemples concrets d'interactions avec le système d'agents.

## Exemple 1 : Nouvelle Feature (Système de Reviews)

### Prompt utilisateur
```
Crée un système de reviews produits avec notes et commentaires
```

### Phase 1 : Consultation (workflow-manager)

```
🤖 [PHASE 1 : CONSULTATION - ANALYSE COMPLÈTE]
═══════════════════════════════════════════════════════════

📋 APPROCHE RECOMMANDÉE : Système de Reviews Complet
═══════════════════════════════════════════════════════════

Je propose d'implémenter un système de reviews complet avec gestion des 
notes (1-5 étoiles), commentaires textuels, et modération.

Architecture proposée :
• Modèle Review (Prisma) avec relations Product et User
• Routes API CRUD : POST/GET/PATCH/DELETE /reviews
• Système de modération (statuts : PENDING/APPROVED/REJECTED)
• Composants React : ReviewCard, ReviewForm, ReviewList
• Pagination des reviews sur les pages produits
• Validation des formulaires avec TanStack Form

Stack technique :
• Backend : ElysiaJS + Prisma + Typebox validation
• Frontend : React + shadcn/ui + TanStack Form + Eden Treaty
• Database : Migration Prisma pour nouveau modèle Review

⏱️  Estimation : 45-60 minutes
👥 Agents : 6 (planner → backend-coder → frontend-coder → database-migration → test-runner → qa-reviewer)

🔄 ALTERNATIVE 1 : MVP Minimal (Rapide)
═══════════════════════════════════════════════════════════
Système de reviews basique sans modération ni pagination.

Avantages :
• Rapide à implémenter (20 minutes)
• Fonctionnel immédiatement
• Peut être étendu plus tard

Inconvénients :
• Pas de modération (tous les reviews sont publics)
• Pas de pagination (problème si beaucoup de reviews)
• Moins sécurisé

⏱️  Estimation : 20 minutes
💡 Cas d'usage : Pour valider rapidement le concept ou MVP

🔄 ALTERNATIVE 2 : API First (Backend seulement)
═══════════════════════════════════════════════════════════
Uniquement le backend avec routes API complètes, pas de frontend.

Avantages :
• Focus sur la qualité de l'API
• Tests backend complets
• Vous développez le frontend vous-même

Inconvénients :
• Pas d'interface utilisateur
• Nécessite développement frontend ultérieur

⏱️  Estimation : 30 minutes
💡 Cas d'usage : Si vous préférez développer le frontend vous-même

⚠️  RISQUES IDENTIFIÉS & MITIGATIONS
═══════════════════════════════════════════════════════════
• Relations Product↔Review (1:N) → Migration Prisma requise, test complet
• Concurrence sur ratings → Transactions atomiques Prisma
• Pagination nécessaire → Implémenter dès le départ avec cursor-based
• Validation des données → Typebox strict sur routes API

❓ QUESTIONS POUR AFFINER L'IMPLÉMENTATION
═══════════════════════════════════════════════════════════
1. Les reviews doivent-elles être modérées avant publication ?
2. Peut-on ajouter des images dans les reviews ?
3. Les reviews sont-elles accessibles publiquement ou uniquement aux admins ?

✅ PROCHAINES ÉTAPES
═══════════════════════════════════════════════════════════

[Y] Je valide l'Approche Recommandée
    → Passage à la Phase 2 : Plan détaillé + Exécution automatique
    
[1] Je choisis l'Alternative 1 (MVP Minimal)
    → Re-présentation d'un plan affiné pour cette approche
    
[2] Je choisis l'Alternative 2 (API First)
    → Re-présentation d'un plan affiné pour cette approche
    
[N] Je veux modifier l'approche / Répondre aux questions
    → Intégration de vos précisions
    → Re-présentation d'une proposition mise à jour

⏸️  [EN ATTENTE DE VOTRE RÉPONSE AVANT TOUTE ACTION]
```

### Réponse utilisateur
```
Y
```

### Phase 2 : Exécution Automatique

```
🚀 [PHASE 2 : EXÉCUTION AUTOMATIQUE]
═══════════════════════════════════════════════════════════

✅ Étape 1/7 : Plan détaillé créé
   └─ 5 phases identifiées avec ordre d'exécution

✅ Étape 2/7 : Analyse technique (planner)
   └─ Architecture validée
   └─ Patterns du codebase identifiés
   └─ Plan d'implémentation détaillé

✅ Étape 3/7 : Implémentation Backend (backend-coder)
   └─ Modèle Review créé (Prisma)
   └─ Routes API : POST /reviews, GET /products/:id/reviews
   └─ Routes API : PATCH /reviews/:id, DELETE /reviews/:id
   └─ Validation Typebox implémentée
   └─ Transactions atomiques pour création
   └─ 4 fichiers créés, 180 lignes de code

✅ Étape 4/7 : Implémentation Frontend (frontend-coder)
   └─ Composant ReviewCard créé
   └─ Composant ReviewForm avec TanStack Form
   └─ Composant ReviewList avec pagination
   └─ Intégration page Product
   └─ Types Eden Treaty utilisés (pas de duplication)
   └─ 3 composants créés, 240 lignes de code

✅ Étape 5/7 : Migration Database (database-migration)
   └─ Migration Prisma créée : 20240204120000_add_reviews
   └─ Relation Product↔Review configurée
   └─ Index sur productId et userId créés
   └─ Migration appliquée avec succès

✅ Étape 6/7 : Tests (test-runner)
   └─ Tests backend : 8/8 passés (routes, validation, relations)
   └─ Tests frontend : 6/6 passés (composants, formulaires)
   └─ Tests intelligents (fichiers modifiés uniquement)
   └─ Temps d'exécution : 12s

✅ Étape 7/7 : QA Review (qa-reviewer)
   └─ TypeScript : 0 erreurs
   └─ Biome linting : 0 erreurs
   └─ Cohérence types backend/frontend : Validée
   └─ Atomicité transactions : Validée
   └─ Tests coverage : Adéquate
   └─ Code quality : Validée

🎉 WORKFLOW TERMINÉ AVEC SUCCÈS !
═══════════════════════════════════════════════════════════

📊 Résumé des réalisations :

Backend :
• 1 modèle Prisma (Review)
• 4 routes API (POST, GET, PATCH, DELETE)
• 4 tests complets
• 180 lignes de code

Frontend :
• 3 composants React (ReviewCard, ReviewForm, ReviewList)
• 1 page mise à jour (Product)
• 6 tests
• 240 lignes de code

Database :
• 1 migration Prisma
• 2 index créés
• Relations configurées

Qualité :
• 0 erreurs TypeScript
• 0 erreurs linting
• 14/14 tests passés
• 100% cohérence types

⏱️  Temps total : 52 minutes 18 secondes
✨ Statut : PRÊT POUR PRODUCTION
```

---

## Exemple 2 : Refactoring (Module Produits)

### Prompt utilisateur
```
Refactor le module des commandes pour réduire la duplication de code
```

### Phase 1 : Consultation

```
🤖 [PHASE 1 : CONSULTATION - ANALYSE COMPLÈTE]
═══════════════════════════════════════════════════════════

📋 APPROCHE RECOMMANDÉE : Refactoring Complet avec Optimisation
═══════════════════════════════════════════════════════════

Après analyse du codebase, j'ai identifié plusieurs opportunités 
d'optimisation dans le module orders.

Problèmes identifiés :
• Duplication de code dans les services (3 fonctions similaires)
• Gestion d'erreurs incohérente entre routes
• Requêtes Prisma non optimisées (N+1 queries)
• Pas de transactions atomiques sur création commande

Architecture de refactoring :
• Extraction service OrderService avec méthodes réutilisables
• Création utilitaire handleOrderError standardisé
• Optimisation requêtes avec include/select ciblés
• Ajout transactions atomiques $transaction
• Refactoring composants frontend OrderCard/OrderList

⏱️  Estimation : 35-45 minutes
👥 Agents : 4 (planner → backend-coder + frontend-coder (parallèle) → test-runner → qa-reviewer)

🔄 ALTERNATIVE 1 : Backend Uniquement
═══════════════════════════════════════════════════════════
Refactoring uniquement du backend, frontend inchangé.

Avantages :
• Plus rapide (20 minutes)
• Moins de risques
• Frontend stable

Inconvénients :
• Duplication frontend reste
• Coût technique reporté

⏱️  Estimation : 20 minutes
💡 Cas d'usage : Si le frontend n'a pas de duplication évidente

🔄 ALTERNATIVE 2 : Refactoring Progressif
═══════════════════════════════════════════════════════════
Refactoring étape par étape sur plusieurs sessions.

Avantages :
• Risque minimal
• Validation entre chaque étape
• Possibilité d'ajustement

Inconvénients :
• Prend plus de temps global
• Coût de context switching

⏱️  Estimation : 3 sessions de 15 minutes
💡 Cas d'usage : Si vous préférez valider chaque étape

⚠️  RISQUES IDENTIFIÉS & MITIGATIONS
═══════════════════════════════════════════════════════════
• Régression fonctionnelle → Tests complets avant/après
• Breaking changes API → Maintenir compatibilité ou versionner
• Performance dégradée → Benchmarks avant/après

❓ QUESTIONS POUR AFFINER L'IMPLÉMENTATION
═══════════════════════════════════════════════════════════
1. Avez-vous identifié des bugs spécifiques à corriger pendant le refactoring ?
2. Préférez-vous maintenir la compatibilité API exacte ou pouvez-vous ajuster les contrats ?

✅ PROCHAINES ÉTAPES
═══════════════════════════════════════════════════════════
[Y] Je valide l'Approche Recommandée
[1] Je choisis l'Alternative 1 (Backend uniquement)
[2] Je choisis l'Alternative 2 (Progressif)
[N] Je veux modifier l'approche

⏸️  [EN ATTENTE DE VOTRE RÉPONSE]
```

### Réponse utilisateur
```
1
```

### Plan Affiné pour Alternative 1

```
🤖 [PLAN AFFINÉ - ALTERNATIVE 1 : Backend Uniquement]
═══════════════════════════════════════════════════════════

✅ OPTION CHOISIE : Refactoring Backend Uniquement

Plan détaillé :
1. Analyse duplication services orders
2. Extraction OrderService avec méthodes communes
3. Standardisation gestion erreurs
4. Optimisation requêtes Prisma
5. Ajout transactions atomiques
6. Tests régression
7. QA validation

⏱️  Estimation : 20 minutes
👥 Agents : 4 (planner → backend-coder → test-runner → qa-reviewer)

[Y] Confirmer et exécuter ce plan
[N] Modifier le plan

⏸️  [EN ATTENTE DE CONFIRMATION]
```

### Réponse utilisateur
```
Y
```

### Phase 2 : Exécution

```
🚀 [PHASE 2 : EXÉCUTION AUTOMATIQUE]
═══════════════════════════════════════════════════════════

✅ Étape 1/5 : Analyse (planner)
   └─ 3 duplications identifiées
   └─ 2 fonctions à extraire
   └─ 5 routes à refactorer

✅ Étape 2/5 : Refactoring Backend (backend-coder)
   └─ OrderService créé avec 4 méthodes réutilisables
   └─ handleOrderError utilitaire créé
   └─ Requêtes optimisées (N+1 éliminés)
   └─ Transactions $transaction ajoutées
   └─ 3 fichiers modifiés, -45 lignes de duplication

✅ Étape 3/5 : Tests (test-runner)
   └─ 12/12 tests existants passés
   └─ 0 régression détectée
   └─ Tests nouvelles méthodes : 4/4 passés

✅ Étape 4/5 : QA Review (qa-reviewer)
   └─ Code duplication : Réduite de 85%
   └─ Complexité cyclomatique : Améliorée
   └─ TypeScript : 0 erreurs
   └─ Atomicité : Validée

✅ Étape 5/5 : Rapport
   └─ Résumé des optimisations

🎉 REFACTORING TERMINÉ !
═══════════════════════════════════════════════════════════

📊 Améliorations réalisées :

Avant :
• 145 lignes de code dupliqué
• 3 fonctions similaires
• N+1 queries sur liste commandes

Après :
• 20 lignes de code dupliqué (-86%)
• 1 service centralisé
• Requêtes optimisées
• Transactions atomiques

Qualité :
• 0 régression
• 16/16 tests passés
• Performance améliorée

⏱️  Temps total : 18 minutes 42 secondes
```

---

## Exemple 3 : Bug Fix (Attributs Produit)

### Prompt utilisateur
```
Corrige le bug où les attributs ne se mettent pas à jour lors de l'édition
```

### Phase 1 : Consultation

```
🤖 [PHASE 1 : CONSULTATION - ANALYSE COMPLÈTE]
═══════════════════════════════════════════════════════════

📋 APPROCHE RECOMMANDÉE : Correction avec Test Régression
═══════════════════════════════════════════════════════════

Problème identifié :
Lors de l'édition d'un produit via PATCH /products/:id, les attributs
ne sont pas persistés en base de données.

Analyse préliminaire :
• Problème probable dans la route PATCH
• Vérification validation Typebox
• Vérification logique de mise à jour Prisma
• Possible omission du champ attributes dans le update

Plan de correction :
1. Analyse route PATCH /products/:id
2. Identification root cause
3. Correction minimale
4. Ajout test régression
5. Vérification fix

⏱️  Estimation : 15-20 minutes
👥 Agents : 3 (planner → backend-coder → test-runner)

🔄 ALTERNATIVE 1 : Correction + Refactoring
═══════════════════════════════════════════════════════════
Corriger le bug ET refactoriser la route pour plus de robustesse.

Avantages :
• Bug corrigé
• Code plus maintenable
• Meilleure gestion erreurs

Inconvénients :
• Plus long (30 minutes)
• Risque d'introduire d'autres bugs

⏱️  Estimation : 30 minutes
💡 Cas d'usage : Si la route a d'autres problèmes évidents

🔄 ALTERNATIVE 2 : Investigation Approfondie
═══════════════════════════════════════════════════════════
Analyse complète du flux attributs avant correction.

Avantages :
• Compréhension totale du problème
• Peut révéler d'autres bugs liés

Inconvénients :
• Très long (45 minutes)
• Overkill pour un bug simple

⏱️  Estimation : 45 minutes
💡 Cas d'usage : Si le bug est symptomatique d'un problème plus large

⚠️  RISQUES IDENTIFIÉS & MITIGATIONS
═══════════════════════════════════════════════════════════
• Fix incomplet → Test régression obligatoire
• Effet de bord → Vérifier autres routes utilisant même pattern

❓ QUESTIONS POUR AFFINER L'IMPLÉMENTATION
═══════════════════════════════════════════════════════════
1. Est-ce que ce bug affecte aussi la création (POST) ou uniquement l'édition (PATCH) ?
2. Avez-vous des exemples de produits avec ce problème que je peux tester ?

✅ PROCHAINES ÉTAPES
═══════════════════════════════════════════════════════════
[Y] Je valide l'Approche Recommandée
[1] Je choisis l'Alternative 1 (Correction + Refactoring)
[2] Je choisis l'Alternative 2 (Investigation)
[N] Je veux modifier l'approche

⏸️  [EN ATTENTE DE VOTRE RÉPONSE]
```

### Réponse utilisateur
```
Y
```

### Phase 2 : Exécution

```
🚀 [PHASE 2 : EXÉCUTION AUTOMATIQUE]
═══════════════════════════════════════════════════════════

✅ Étape 1/4 : Analyse (planner)
   └─ Route PATCH /products/:id analysée
   └─ Root cause identifiée : champ 'attributes' manquant dans update

✅ Étape 2/4 : Correction (backend-coder)
   └─ Ligne 45 : Ajout 'attributes: body.attributes' dans update
   └─ 1 ligne modifiée
   └─ Validation Typebox déjà correcte

✅ Étape 3/4 : Test Régression (test-runner)
   └─ Test créé : "should update product with attributes"
   └─ Test passé : 200 OK, attributes persistés
   └─ Tests existants : 8/8 passés (0 régression)

✅ Étape 4/4 : Rapport
   └─ Root cause : Omission champ attributes
   └─ Fix : 1 ligne ajoutée
   └─ Test : Ajouté et passé

🎉 BUG CORRIGÉ !
═══════════════════════════════════════════════════════════

📊 Résumé :

Problème :
• PATCH /products/:id ignorait le champ attributes
• Les attributs n'étaient pas persistés

Solution :
• Ajout 'attributes' dans l'objet update Prisma
• 1 ligne de code modifiée

Validation :
• Test régression créé et passé
• 0 régression sur tests existants

⏱️  Temps total : 12 minutes 15 secondes
✅ Statut : BUG CORRIGÉ ET VÉRIFIÉ
```

---

## Résumé des Patterns

### Commandes Utilisateur

| Commande | Action |
|----------|--------|
| `Y` ou `GO` | Valide Approche Recommandée |
| `1` | Choisit Alternative 1 |
| `2` | Choisit Alternative 2 |
| `N` | Demande modifications |
| Réponses aux questions | Fournit précisions |

### Workflow Automatique

Une fois `[Y]` reçu :
1. ✅ Plan détaillé créé
2. ✅ Subagents invoqués automatiquement
3. ✅ Exécution parallèle quand possible
4. ✅ Tests automatiques
5. ✅ QA automatique
6. ✅ Rapport final

**Zero intervention utilisateur nécessaire entre [Y] et le rapport final !**
