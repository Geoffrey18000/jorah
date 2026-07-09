# Jorah

L'essentiel de l'actu IA, robotique & tech — agrégé automatiquement et mis à jour toutes les heures.

**Site : [jorah.fr](https://jorah.fr)**

## Comment ça marche

- [build.js](build.js) récupère les flux RSS de 6 sources (Numerama, ActuIA, TechCrunch AI, The Verge, MIT Tech Review, IEEE Spectrum Robotics) et génère `site/index.html`.
- Une GitHub Action ([deploy.yml](.github/workflows/deploy.yml)) relance la génération toutes les heures et publie le site sur GitHub Pages.

## Commandes

```bash
node build.js   # régénère le site avec les dernières actus
node server.js  # prévisualise en local sur http://localhost:4173
```
