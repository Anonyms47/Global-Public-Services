# Informations provisoires à confirmer

Le site en ligne a été rempli avec des valeurs provisoires pour être présentable. Tout se modifie dans le Comptoir, sans toucher au code.

| Où (Comptoir)                  | Valeur actuelle                                                    | À faire                                               |
| ------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------- |
| Paramètres → Coordonnées       | WhatsApp, téléphone, e-mail, adresse, ville, lien Maps : **vides** | Saisir les vrais. Les boutons s'activent seuls        |
| Paramètres → Coordonnées       | Horaires « Lundi au samedi, 9 h – 19 h (provisoire) »              | Corriger, puis retirer « (provisoire — à confirmer) » |
| Paramètres → Mentions légales  | Raison sociale « GPS — Global Public Services (provisoire) »       | Raison sociale exacte et numéro d'immatriculation     |
| Paramètres → Réception         | Zone 1 : 1 000 FCFA, Zone 2 : 2 000 FCFA, Zone 3 : à confirmer     | Vraies zones et vrais tarifs                          |
| Paramètres → Textes            | Garantie, retours, paiement, retrait, livraison : propositions GPS | Relire et ajuster                                     |
| Vitrine & services → Transfert | Opérateurs « à confirmer »                                         | Nommer les opérateurs, puis cocher « Confirmé »       |
| Vitrine & services → Boutique  | Pas de photo de la boutique                                        | Ajouter une vraie photo du comptoir                   |
| Catalogue                      | 11 produits d'exemple avec photos Unsplash (« photo d'exemple »)   | Purger la démo, saisir le vrai catalogue et photos    |

Les numéros n'ont volontairement pas été inventés : un faux numéro WhatsApp pourrait appartenir à une vraie personne et recevoir les commandes de vos clients.

Une fois tout confirmé : Paramètres → **Purger** les données d'exemple, puis dans Vercel `DEMO_MODE=false` et `SITE_INDEXABLE=true` (voir `mise-en-ligne.md`).
