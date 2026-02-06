# 🚀 Agent Workflow System - Quick Start

Système d'agents orchestrés pour développement full-stack automatisé.

## Agents Disponibles

| Agent | Rôle | Déclencheur |
|-------|------|-------------|
| `workflow-manager` | Orchestrateur principal | Toutes les tâches complexes |
| `planner` | Analyse & Planification | Phase initiale |
| `backend-coder` | Backend ElysiaJS | Implémentation API |
| `frontend-coder` | React/Next.js | Implémentation UI |
| `test-runner` | Tests intelligents | Validation |
| `qa-reviewer` | Revue finale | Contrôle qualité |
| `database-migration` | Migrations Prisma | Changements schéma |

## 🎯 Exemples de Prompts One-Shot

### Nouvelle Feature Complète
```
Crée un système de reviews produits avec :
- Backend : modèles Prisma, routes API CRUD, tests
- Frontend : composants ReviewCard, formulaire, liste
- Assure la cohérence des types entre backend/frontend
```

### Refactoring
```
Refactor le module des commandes pour :
- Réduire la duplication de code
- Améliorer la gestion des erreurs  
- Rendre les transactions plus atomiques
- Maintenir toutes les fonctionnalités existantes
```

### Bug Fix
```
Corrige le bug où les attributs de produit ne se mettent 
pas à jour lors de l'édition dans la route PATCH /products/:id
```

## 📋 Workflows Automatiques

### 1. NEW_FEATURE
Déclencheurs : "Crée", "Ajoute", "Implémente", "Nouveau"

```
planner → backend-coder → [frontend-coder || database-migration] → test-runner → qa-reviewer
```

### 2. REFACTORING
Déclencheurs : "Refactor", "Optimise", "Améliore", "Clean up"

```
planner → [backend-coder || frontend-coder] → test-runner → qa-reviewer
```

### 3. BUGFIX
Déclencheurs : "Corrige", "Fix", "Résouds", "Bug"

```
planner → [backend-coder | frontend-coder] → test-runner → qa-reviewer
```

## ⚡ Stratégie de Tests Intelligents

Le `test-runner` exécute automatiquement :
- ✅ **Tests sélectifs** : Uniquement fichiers modifiés (par défaut)
- ✅ **Tests impactés** : Routes/services liés aux changements
- ⚠️ **Full suite** : Seulement si migration Prisma ou changement core

## 📖 Documentation Complète

Voir [WORKFLOWS.md](WORKFLOWS.md) pour :
- Détails de chaque workflow
- Plus d'exemples de prompts
- Guide de personnalisation
- Tips & best practices

## 🎛️ Configuration

Les agents sont dans `.opencode/agents/` :
- `workflow-manager.md` - Orchestrateur
- `backend-coder.md` - Développement backend
- `frontend-coder.md` - Développement frontend
- `planner.md` - Analyse et planification
- `test-runner.md` - Tests intelligents
- `qa-reviewer.md` - Revue qualité
- `database-migration.md` - Migrations Prisma

## ✨ Features Clés

- **Orchestration automatique** : Détection intelligente du workflow
- **Exécution parallèle** : Backend et frontend en parallèle quand possible
- **Tests diff-aware** : Uniquement les tests nécessaires
- **Type safety** : Cohérence backend/frontend automatique
- **Validation complète** : Tests + QA review systématiques

## 🚀 Utilisation

1. **Ouvrez une session opencode** dans votre projet
2. **Lancez un prompt** décrivant ce que vous voulez
3. **Laissez l'orchestrateur** coordonner les agents
4. **Suivez la progression** et validez le résultat

```bash
# Exemple de session
$ opencode

> Crée un système complet de gestion des coupons de réduction
  avec backend (modèles, routes, validation) et frontend 
  (formulaire admin, application panier), tests inclus

🚀 Workflow détecté : NEW_FEATURE
📋 Phase 1/4 : Analyse...
🔧 Phase 2/4 : Implémentation Backend...
🎨 Phase 3/4 : Implémentation Frontend...
✅ Phase 4/4 : Validation...

✨ Feature prête pour production !
```

---

**Pro Tip** : Commencez simple et ajoutez de la complexité. Le système apprend de vos préférences !
