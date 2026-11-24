# Paiement Wave automatique

Le client paie par Wave depuis la page `/paiement/<jeton>` ; la commande est marquée **payée** automatiquement
quand Wave confirme le paiement. Tant que les deux variables ci-dessous ne sont pas définies, le site garde le
parcours manuel (lien Wave avec montant + capture d'écran + vérification au Comptoir).

## Mise en route (une fois)

1. Compte **Wave Business** → Portail développeur (https://business.wave.com/dev-portal) → créer une **clé API**
   (elle n'est affichée qu'une fois). Section réservée aux administrateurs ; sinon contacter le support API Wave.
2. Même portail → **Webhooks** → ajouter `https://www.globalpublicservices.com/api/webhooks/wave`,
   stratégie **Signing Secret**, événements `checkout.session.completed` et `checkout.session.payment_failed`.
   Le secret (`wave_sn_WHS_…`) n'est affiché qu'une fois.
3. Vercel → projet → Settings → Environment Variables (Production uniquement) :
   - `WAVE_API_KEY` = la clé API
   - `WAVE_WEBHOOK_SECRET` = le secret de signature du webhook
     Puis redéployer. Ne jamais écrire ces valeurs dans le dépôt, un message ou un document.
4. Test : créer une commande de quelques francs, ouvrir son lien de paiement, payer, vérifier que la commande
   passe à « payée » avec la mention « Wave automatique — transaction … ».

## Garanties

- Le montant envoyé à Wave est le **reste à payer calculé côté serveur** ; livraison non chiffrée : aucun paiement.
- Un clic, un retour de page ou une déclaration ne marquent **jamais** une commande comme payée.
- Le webhook est authentifié (signature HMAC-SHA256, fenêtre de 5 minutes) puis la session est **relue auprès de
  Wave** (état « succeeded », devise XOF, montant identique) avant d'écrire le paiement.
- Doublons ignorés (identifiant d'événement) ; un paiement ne dépasse jamais le solde ; cas anormal
  (annulée, déjà soldée, montant différent) → rien d'enregistré, mention dans la chronologie de la commande, à
  traiter au Comptoir.
- Si Wave est indisponible, le client voit un message et le lien manuel reste utilisable.

## Orange Money

Pas d'API intégrée (elle suppose un contrat marchand Orange Money et des identifiants). Le parcours reste :
lien Orange Money → « J'ai effectué le paiement » → capture d'écran → vérification au Comptoir.

## Retour en arrière

Supprimer `WAVE_API_KEY` (ou `WAVE_WEBHOOK_SECRET`) dans Vercel et redéployer : le site revient au parcours
manuel. Les tables `wave_sessions` et `wave_events` restent, sans effet.
