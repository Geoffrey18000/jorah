# Jorah

L'essentiel de l'actu IA & tech, en français — agrégé automatiquement et mis à jour toutes les heures.

**Site : [jorah.fr](https://jorah.fr)**

## Comment ça marche

- [build.js](build.js) récupère les flux RSS de 7 sources françaises (ActuIA, Journal du Geek, Numerama, Siècle Digital, Clubic, Korben, Trust My Science) et génère les pages du site : accueil (flux d'actus), Outils IA (annuaire), Guides / Comparatifs / Blog (à venir).
- Une GitHub Action ([deploy.yml](.github/workflows/deploy.yml)) relance la génération toutes les heures et publie le site sur GitHub Pages.
- Aucune dépendance, aucun coût d'hébergement.

## Commandes

```bash
node build.js   # régénère le site avec les dernières actus
node server.js  # prévisualise en local sur http://localhost:4173
```
