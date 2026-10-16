# GPS — Prompt Claude Code pour rechercher et importer le catalogue réel

Copie-colle tout ce prompt dans Claude Code, ouvert à la racine du dépôt `Anonyms47/Global-Public-Services`.

---

## MISSION

Tu interviens sur le projet en production **GPS — Global Public Services**.

- Site public : `https://gps-global-public-services.vercel.app`
- Comptoir : `https://gps-global-public-services.vercel.app/comptoir`
- Stack connue : Next.js 16, React 19, TypeScript, Supabase/PostgreSQL, Supabase Storage, Vercel.
- État : `DEMO_MODE=false`, `SITE_INDEXABLE=false`, catalogue vide, deux points de vente publiés, stock unique commun.
- Le propriétaire réel est `Ndiogou`. Ne modifie ni son compte, ni ses sessions, ni ses permissions.
- Le formulaire produit et le système de médias sont déjà terminés (PR #40).

Ton objectif est de **rechercher, préparer puis ajouter automatiquement au Comptoir les produits réellement observés dans les photos de la boutique**, avec leurs caractéristiques fiables, leurs catégories, leurs descriptions, leurs variantes et leurs médias.

Tous les produits doivent être créés en **BROUILLON PRIVÉ**. Aucun produit ne doit être publié automatiquement, car les prix, coûts, quantités exactes, garanties et parfois l’authenticité doivent encore être vérifiés physiquement en boutique.

## RÈGLES ABSOLUES

1. Ne supprime aucune donnée réelle.
2. Ne modifie aucun point de vente, compte, rôle, commande, réglage commercial ou variable Vercel.
3. Ne réactive aucune donnée de démonstration.
4. Ne rends pas le site indexable.
5. Ne publie aucun produit.
6. N’invente jamais : prix, coût, stock, code-barres, couleur disponible, capacité mémoire, garantie, état neuf/occasion, authenticité, compatibilité ou caractéristique technique.
7. Une caractéristique n’est enregistrée que si elle est confirmée par :
   - la boîte visible sur les photos ;
   - le site officiel du fabricant ;
   - un manuel officiel ;
   - ou deux sources marchandes cohérentes lorsque le fabricant ne documente pas le produit.
8. Si les sources se contredisent, conserver uniquement les données visibles sur la boîte et ajouter une note interne `À vérifier en boutique`.
9. Ne jamais présenter un produit comme `original`, `authentique`, `officiel Apple`, `officiel JBL`, `officiel Sony` ou équivalent sans justificatif fournisseur.
10. Pour un accessoire tiers, employer `compatible avec…`, jamais une formulation laissant croire qu’il est fabriqué par Apple, Samsung ou une autre marque.
11. Ne jamais hotlinker une image distante.
12. Utiliser en priorité les photos prises dans la boutique. Une image trouvée en ligne ne peut être téléchargée que depuis le fabricant ou une médiathèque dont les conditions autorisent clairement cet usage. Enregistrer l’URL source, la date, le titulaire et le statut d’autorisation dans les métadonnées internes.
13. Si le droit de réutilisation n’est pas clair, ne pas importer l’image : conserver la photo de boutique ou laisser le produit sans média en attendant une meilleure photo.
14. Ne jamais prendre une photo provenant d’un autre vendeur, d’une marketplace, d’un réseau social ou d’un concurrent pour la publier sur GPS.
15. Toute opération d’import doit être idempotente : relancer la commande ne doit jamais créer de doublons.

## PHOTOS À TRAITER

Les photos du relevé sont nommées de `IMG_3638.jpeg` à `IMG_3719.jpeg`, à l’exception de `IMG_3680.jpeg` qui n’a pas été fournie.

Si les fichiers ne se trouvent pas dans le dépôt, ne bloque pas le projet et ne fabrique pas d’images : prépare l’import et indique précisément le dossier attendu. Les médias officiels autorisés peuvent compléter les photos de boutique, mais ne doivent jamais servir à masquer une incertitude de modèle.

## MÉTHODE OBLIGATOIRE

### Étape 1 — Audit sans modification

Avant tout changement :

- lire le schéma, les migrations, le stockage, les actions serveur, les validations et les tests existants ;
- identifier le mécanisme officiel de création d’un produit, de variantes, de stock initial, de médias et de journal d’activité ;
- ne pas contourner les règles métier par des insertions SQL brutes si une action métier existe ;
- vérifier que la production contient toujours zéro produit avant l’import ;
- produire un inventaire pré-import et une sauvegarde datée ;
- exécuter un dry-run qui n’écrit rien.

### Étape 2 — Fichier source du catalogue

Créer dans le dépôt un manifeste versionné, par exemple :

`data/gps-catalogue-reel-2026-10-16.json`

Chaque entrée doit contenir au minimum :

- `externalKey` stable, par exemple `gps-oraimo-otw-323p` ;
- nom public ;
- marque ;
- modèle/référence ;
- catégorie ;
- sous-type ;
- description courte ;
- description complète ;
- caractéristiques structurées ;
- variantes confirmées uniquement ;
- compatibilités ;
- contenu de la boîte uniquement s’il est confirmé ;
- source de chaque caractéristique ;
- mots-clés de recherche ;
- titre SEO et description SEO ;
- statut `draft` ;
- `needsHumanReview` ;
- liste des vérifications humaines restantes ;
- médias avec source, droits, texte alternatif et correspondance couleur ;
- références des photos de boutique où le produit apparaît.

Les champs inconnus doivent être `null`, jamais remplacés par une valeur supposée. Prix, coût et stock doivent rester non renseignés ou utiliser le mécanisme de brouillon prévu par l’application. Ne jamais enregistrer un faux prix à zéro si celui-ci peut apparaître au public.

### Étape 3 — Recherche documentaire

Pour chaque produit identifiable :

1. rechercher d’abord le site officiel et le manuel officiel ;
2. confirmer que la référence correspond exactement à la boîte ;
3. conserver les URL et la date de consultation ;
4. résumer les informations en français naturel, sans copier de longs textes protégés ;
5. ne pas reprendre les avis, notes, prix étrangers, faux compteurs ou arguments non vérifiables ;
6. utiliser les unités et formats français ;
7. mentionner `jusqu’à` pour les autonomies annoncées par le constructeur ;
8. séparer une donnée constructeur d’une donnée constatée par GPS.

## MANIFESTE INITIAL À CRÉER

### A. Produits dont la référence est suffisamment établie

#### Audio Oraimo

1. **Oraimo SpaceBuds Neo+ — OTW-323P**
   - Bluetooth 5.4 ; portée 10 m ; recharge USB-C.
   - Autonomie annoncée : jusqu’à 5 h + 25 h avec boîtier, ANC désactivé ; jusqu’à 4 h + 20 h, ANC activé.
   - Fonctions confirmées : réduction active du bruit et Sound360 Spatial Audio.
   - Source de départ : `https://www.oraimo.com/product/tune-in-noise-out-active-noise-cancellation-elegant-metallic-design-30-hour-long-playtime-sound360-spatial-audio-spacebuds-neo`

2. **Oraimo SpaceBuds Lite — OTW-324**
   - Bluetooth 5.4 ; portée 10 m ; recharge USB-C ; écouteurs 10 mm ; IPX4.
   - Autonomie annoncée : jusqu’à 7 h + 33 h avec boîtier.
   - Couleurs officielles documentées : Gravity Black, Light Gold, Digital Lavender. Ne créer que les couleurs physiquement confirmées en boutique.
   - Source : `https://www.oraimo.com/product/powerful-bass-pure-immersion-spacebuds-lite`

3. **Oraimo BoomPop Lite — OHP-317**
   - Bluetooth 5.3 et entrée auxiliaire 3,5 mm ; portée au moins 10 m ; transducteurs 40 mm ; USB-C.
   - Autonomie constructeur : jusqu’à 65 h. Ne pas afficher 60 h et 65 h simultanément ; utiliser la fiche mondiale et indiquer `jusqu’à 65 h`.
   - Source : `https://www.oraimo.com/product/endless-beats-all-day-long-boompop-lite`

4. **Oraimo BoomPop Pro — OHP-917**
   - Bluetooth 5.4 ; portée 10 m ; recharge USB-C en environ 2 h.
   - Jusqu’à 82 h sans ANC et 53 h avec ANC.
   - ANC hybride, commandes tactiles/glissées.
   - Source : `https://www.oraimo.com/product/silence-meets-clarity-boompop-pro`

5. **Oraimo Necklace Lite — OEB-311**
   - Bluetooth 5.3 ; portée 10 m ; batterie 220 mAh ; USB-C ; jusqu’à 30 h.
   - Alerte vibrante pour les appels.
   - Source : `https://www.oraimo.com/product/vibrate-to-the-rhythm-necklace-lite`

6. **Oraimo OpenCirclet 2 — OPN-672**
   - Écouteurs ouverts ; Bluetooth 5.4 ; portée au moins 10 m ; USB-C ; jusqu’à 16 h ; IPX5 visible/documenté.
   - Source : `https://www.oraimo.com/product/move-free-sound-bold-opencirclet-2`

#### Montres Oraimo

7. **Oraimo Watch 5 Lite — OSW-804**
   - Écran TFT tactile 2,01 pouces, 240 × 296 ; Bluetooth 5.3 ; batterie 300 mAh ; recharge environ 3 h.
   - Jusqu’à 7 jours d’utilisation et plus de 28 jours en veille ; IP68 ; application Oraimo Health.
   - Source : `https://www.oraimo.com/product/201-hd-screen-full-control-oraimo-watch-5-lite`

8. **Oraimo Watch 6R — OSW-823**
   - Écran tactile TFT 1,39 pouce, 240 × 240 ; Bluetooth 5.3 ; batterie 300 mAh ; recharge environ 3 h ; IP68.
   - Jusqu’à 7 jours d’utilisation et 28 jours en veille ; appels Bluetooth, fréquence cardiaque et SpO2.
   - Source : `https://www.oraimo.com/product/139-hd-colorful-screen-vivid-viewing-watch-6r`

#### Énergie Oraimo

9. **Oraimo PowerBox 600 — OPB-P600Q**
   - Attention : corriger l’ancienne lecture `OPB-P6001` si la boîte et le site officiel confirment `OPB-P600Q`.
   - 60 000 mAh / 222 Wh ; charge rapide maximale annoncée 22,5 W ; PD/QC ; écran LED ; cinq sorties ; deux entrées ; lampe/alarme SOS.
   - Source : `https://www.oraimo.com/product/60000mah-super-huge-capacity-power-bank-one-charge-for-three-weeks-powerbox-600`

10. **Oraimo SmartTableFan Mini — ODF-201A**
    - Le modèle est confirmé par la boîte.
    - Ne saisir aucune autonomie, puissance ou capacité non lisible sans page officielle exacte.

11. **Oraimo PowerCube 62 — OCW-1062EC**
    - Corriger l’ancienne référence supposée `OCW-U62` si la boîte correspond bien à `OCW-1062EC`.
    - Prise européenne. Relever les tensions exactes sur la boîte ou la page officielle avant de compléter.
    - Source : `https://ma.oraimo.com/en/product/oraimo-charger-powercube-62-ocw-1062ec-black`

#### Téléphones

12. **Samsung Galaxy A06 — 4G**
    - Ne pas confondre avec le Galaxy A06 5G.
    - Écran 6,7 pouces HD+ 720 × 1600 ; processeur MediaTek Helio G85 ; caméra arrière principale 50 Mpx + capteur de profondeur 2 Mpx ; caméra avant 8 Mpx ; batterie 5 000 mAh ; charge jusqu’à 25 W.
    - Ne créer les variantes RAM/stockage/couleur qu’après lecture de l’étiquette de chaque boîte.
    - Source : `https://www.samsung.com/levant/smartphones/galaxy-a/galaxy-a06-light-blue-128gb-sm-a065flbhmea/`

13. **Nokia 105**
    - La génération doit être confirmée avant d’ajouter des caractéristiques précises.
    - Pour la version récente documentée : écran 1,8 pouce QQVGA, batterie 1 000 mAh, jack 3,5 mm, radio FM sans fil, jusqu’à 2 000 contacts et 500 SMS.
    - Source : `https://www.hmd.com/en_int/nokia-105`

14. **Nokia 105 4G — édition visible sur la boîte à confirmer**
    - Ne pas mélanger les versions 2021, 2023, 2024 et « 4th Edition ».
    - Si la boîte correspond à la version 2024 : batterie amovible 1 450 mAh, appels 4G HD, double lampe, radio FM, lecteur MP3 et jusqu’à 2 000 contacts.
    - Source : `https://www.hmd.com/en_int/nokia-105-4g-2024`

15. **KGTEL K2163**
    - Téléphone à touches ; emballage indiquant une autonomie en veille supérieure à 13 jours et une batterie annoncée 1 150 mAh.
    - Ne pas ajouter d’autres caractéristiques non confirmées.

16. **ASTECH Neo**
    - Le nom et le modèle sont confirmés par la boîte.
    - RAM, stockage, écran, appareil photo, réseau et batterie doivent rester à confirmer en boutique ou sur une source fabricant exacte.

17. **CORN Classy S26 Ultra**
    - Le modèle est visible. Ne pas l’assimiler à un Samsung Galaxy S26 Ultra.
    - Toutes les spécifications restent à confirmer.

#### Informatique et outils

18. **HP Wired Mouse X500**
    - Souris USB filaire, suivi optique, trois boutons, forme ambidextre.
    - Source de départ : documentation officielle HP X500.

19. **Casio fx-991ES PLUS**
    - Calculatrice scientifique non programmable et non graphique ; 417 fonctions ; affichage Natural Textbook ; 10 + 2 chiffres ; alimentation solaire et pile.
    - Ne pas affirmer l’authenticité avant contrôle du produit.
    - Source : `https://www.casio.com/intl/scientific-calculators/product.FX-991ESPLUS/`

20. **Plokama U160 Pro**
    - Lampe vidéo LED/RGB ; 2 000 mAh ; CRI Ra95+ ; 2 700 à 6 500 K ; USB-C ; autonomie annoncée jusqu’à 90 min ; montage 1/4 pouce et griffe porte-accessoire.
    - Source secondaire cohérente à conserver avec prudence : page produit U160 Pro. Marquer la fiche pour validation humaine, car aucun site fabricant officiel fiable n’a été trouvé.

21. **Plokama PK-771 Smartphone Video Kit**
    - Kit visible avec trépied, microphone et éclairage. Confirmer le contenu exact sur la boîte avant description.

22. **Plokama Soft Ring Light 450 mm**
    - Diamètre annoncé 450 mm. Les autres données restent à confirmer.

#### Chargeurs Apple ou compatibles Apple — authenticité non prouvée

23. **Adaptateur 45 W MagSafe 2**
    - Données standard Apple : entrée 100–240 V, 50/60 Hz ; sortie 14,85 V / 3,05 A.
    - Ne pas utiliser la marque Apple dans le champ fabricant tant que l’authenticité n’est pas contrôlée. Au besoin, nommer `Adaptateur compatible MacBook Air 45 W — connecteur MagSafe 2`.
    - Source technique : `https://cdsassets.apple.com/live/6GJYWVAV/user/locale/en-gb/ma1986_apple-magsafe-2-power-adapter-ug.pdf`

24. **Adaptateurs MagSafe 2 60 W et/ou 85 W**
    - Ne créer que les puissances réellement lisibles sur les boîtes.
    - 60 W : 16,5 V / 3,65 A ; 85 W : 20 V / 4,25 A.

25. **Adaptateurs USB-C pour MacBook, puissances à confirmer**
    - Les boîtes semblent correspondre à plusieurs puissances Apple historiques, potentiellement 61 W, 87 W et 96 W.
    - Ne créer aucune variante avant photographie rapprochée de chaque étiquette.
    - Référence de compatibilité : `https://support.apple.com/en-us/109509`

26. **Câble de charge magnétique Apple Watch vers USB-C — 1 m**
    - Si l’authenticité n’est pas prouvée, nommer `Câble de charge magnétique compatible Apple Watch vers USB-C — 1 m`.
    - Source technique officielle : `https://www.apple.com/shop/product/ml434am/a/apple-watch-magnetic-fast-charger-to-usb-c-cable-1-m`

### B. Produits identifiés par leur emballage, mais sans documentation officielle fiable

Créer ces produits en brouillon avec uniquement les données visibles. Ajouter `needsHumanReview: true`.

27. TDKC313 Power Bank **TDK-14**, 40 000 mAh, charge annoncée 22,5 W.
28. TDKC313 Power Bank **TDK-13**, 30 000 mAh, charge annoncée 22,5 W.
29. TDKC313 Power Bank **TDK550**, 10 000 mAh, charge annoncée 22,5 W.
30. TDKC313 écouteurs sport **TDK-21**, autonomie annoncée 26 h.
31. TDKC313 Open Earphone **TDK-360**.
32. TDKC313 écouteurs sans fil **Hi-Fi 6G**, référence exacte à relever.
33. TDKC313 écouteurs blancs de type tige, modèle non lisible.
34. TDKC313 adaptateur USB-C 35 W.
35. TDKC313 adaptateur USB-C PD 45 W.
36. TDKC313 adaptateur GaN 45 W avec câble USB-C vers USB-C.
37. TDKC313 **TDK-E02**, chargeur 45 W.
38. TDKC313 kit chargeur + câble USB-C vers Lightning, 50 W annoncés sur la boîte.
39. TDKC313 câble USB-C vers Lightning, 35 W, 1 m.
40. TDKC313 câble coudé USB-C vers Lightning **C-I107**, 27 W.
41. TDKC313 câble USB-C vers Lightning, 2 m.
42. TDKC313 câble USB-C vers USB-C, 2 m, 60 W.
43. TDKC313 câbles forte puissance annoncée 120 W, connecteurs à confirmer.
44. Chargeur double port USB-A + USB-C **OS-C56**, puissance à confirmer.
45. Souris sans fil JEQANG **JW-AP03**, 2,4 GHz.
46. Clavier filaire JEQANG **JK-905**.
47. Casque Bluetooth LANGEER **LGE-KC99**.
48. Casque filaire BlueSpectrum **F-1**, jack 3,5 mm, microphone/commandes.
49. Écouteurs Lightning OKMAX **KM-113**.
50. Écouteurs ouverts Air Conduction OKMAX **KM-813**.
51. Montre connectée **S9 Pro**, écran annoncé 2,19 pouces ; marque exacte à confirmer.
52. Enceinte Bluetooth Amiya **BD68**, Bluetooth 5.3, IPX5 et 15 W annoncés sur l’emballage.
53. Enceinte portable aibimy, modèle à relever.
54. Enceinte LED avec recharge sans fil **BT2301**.
55. Microphone sans fil, référence paraissant être **AUD-1000IR**, à confirmer.
56. Transmetteur FM automobile **X8S**, lecteur MP3, sortie annoncée 3,1 A.
57. Manette sans fil **V8**, compatibilités seulement selon les mentions exactes de la boîte.
58. Manette de type DualShock 3 ; ne pas utiliser `Sony officiel` sans preuve.
59. Tapis de souris ergonomique **H-02**.
60. Support pliable téléphone/tablette **Carbon Steel L-07**, rotation annoncée 360°.
61. Étui rotatif tablette **T307**.
62. Radio multibande, modèle à relever.
63. Écouteurs filaires blancs avec commandes, marque et modèle à relever.
64. Clés USB, capacités à relever individuellement.

### C. Familles d’accessoires à modéliser correctement

Ne pas créer une fiche vague avec toutes les compatibilités mélangées. Créer une famille et des variantes uniquement pour les compatibilités physiquement disponibles.

65. **Coques de téléphone**
    - Compatibilités visibles : iPhone XR, 11 Pro, 12 Pro, 13, 14, 15 Pro, 15 Pro Max, 16, 16 Plus, 16 Pro, 17 Pro, 17 Air ; Samsung A07, A16, A24, A25, A34, A54, Z Fold 5, Z Fold 6, Z Flip 4, Z Flip 5, Z Flip 7 ; Tecno Pop 20.
    - Styles visibles : transparent, renforcé, anneau, magnétique, imitation cuir, décoratif.
    - Une variante doit avoir une seule compatibilité claire. Ne pas annoncer MagSafe si le produit ne porte pas explicitement cette mention.

66. **Coques compatibles écouteurs de type AirPods**
    - Compatibilités visibles : AirPods 1/2, AirPods Pro, AirPods 3 et AirPods 4.
    - Styles : Kuchi renforcé, imitation cuir avec mousqueton, rose, bleu clair, logo Bentley.
    - Employer `compatible avec`. Ne jamais créer `Coque Apple` ou `Coque Bentley officielle` sans autorisation.

67. **Bracelets compatibles Apple Watch**
    - Tailles visibles : 42, 44, 45 et 49 mm.
    - Matières visibles : silicone, imitation cuir et métal.
    - La taille, la couleur et la matière doivent être des variantes confirmées.

68. **Coques/protections compatibles Apple Watch**
    - Tailles visibles : 44 et 49 mm, dont GUOI et modèles 360°.

69. **Protections d’écran**
    - Téléphones et tablettes ; Samsung Tab A9 ; iPad 10,5 pouces ; autres modèles à relever.
    - Variantes par appareil, type de film et finition uniquement si ces informations sont lisibles.

70. **Piles bouton**
    - CR2032 et CR2016 confirmées. CR2025 ne doit être ajoutée que si une nouvelle photo le confirme.

71. **Fournitures diverses**
    - Slide Binder HAOXIANG ; stylos roller 0,5 mm référence 199SH2000A ; marqueurs HaiJiaV HJ-2004 ; trombones No. 80028.
    - Mettre dans `Autres articles` ou créer une catégorie `Fournitures` seulement après validation du propriétaire.

### D. Produits visibles mais insuffisamment identifiés

Ne pas créer automatiquement une fiche publique. Créer une entrée de travail ou un brouillon marqué `Identification requise` seulement si l’application sait gérer ce cas proprement :

- smartphone CORN supplémentaire, modèle illisible ;
- iPhone rouge, modèle/capacité/état illisibles ;
- second iPhone récent, modèle/capacité/état illisibles ;
- tablette Lenovo noire ;
- iPad doré ;
- tablette Samsung noire ;
- tablette/boîte marquée S8 ;
- téléphones classiques noirs supplémentaires ;
- boîtes d’écouteurs de type AirPods, génération et authenticité non vérifiées ;
- supports `Bracket` ;
- éventuels cahiers et fournitures dont les références ne sont pas lisibles.

Pour les téléphones et tablettes d’occasion, prévoir les champs humains obligatoires : état, défauts, batterie si mesurée, capacité, RAM, couleur, SIM, réseau, accessoires, garantie, IMEI partiellement masqué en interne et jamais affiché publiquement.

## CATÉGORIES

Réutiliser les catégories existantes lorsque possible. Proposer, sans dupliquer :

- Téléphones
- Tablettes
- AirPods & écouteurs
- Casques
- Montres
- Chargeurs
- Câbles
- Batteries externes
- Enceintes & audio
- Informatique
- Création de contenu
- Accessoires téléphone
- Protections & coques
- Jeux
- Fournitures
- Autres articles

Si une nouvelle catégorie est nécessaire, utiliser le module Catégories existant et ne jamais modifier manuellement les slugs après création sans vérifier les liens.

## RÉDACTION DES FICHES

Pour chaque produit :

- nom clair, sans bourrage de mots-clés ;
- résumé de 120 à 180 caractères ;
- description de deux à quatre paragraphes courts ;
- 4 à 8 caractéristiques factuelles ;
- avantages exprimés sans promesse exagérée ;
- compatibilité explicite ;
- avertissement si la puissance dépend du téléphone/câble ;
- autonomie précédée de `jusqu’à` ;
- aucune fausse urgence, aucun faux avis, aucune fausse réduction ;
- français naturel adapté au Sénégal ;
- prix en FCFA uniquement après saisie humaine.

Le SEO doit rester honnête : titre inférieur à environ 60 caractères, description proche de 150 caractères, slug stable, pas de marque concurrente utilisée abusivement.

## MÉDIAS

1. Associer chaque photo de boutique au bon produit grâce au nom du fichier et à la position du produit dans l’image.
2. Ne pas réutiliser une même photo comme photo principale de plusieurs produits si elle montre plusieurs boîtes sans cadrage clair.
3. Créer un recadrage seulement si le système existant le permet sans dégrader l’original.
4. Conserver l’original et générer les tailles optimisées via le pipeline existant.
5. Texte alternatif : marque + modèle + vue, sans mots-clés artificiels.
6. Pour toute image externe autorisée : télécharger, vérifier le type MIME, supprimer les métadonnées inutiles, optimiser, envoyer dans Supabase Storage et conserver la provenance en interne.
7. Si l’image officielle représente une couleur non présente en boutique, ne pas l’utiliser pour une variante différente.

## IMPORT AUTOMATIQUE

Créer une commande interne protégée, par exemple :

`npm run catalogue:import:gps -- --dry-run`

puis :

`npm run catalogue:import:gps -- --apply`

Contraintes :

- propriétaire uniquement ;
- exécution serveur ;
- transaction par produit ou stratégie de reprise sûre ;
- idempotence par `externalKey`, référence et code-barres ;
- aucun doublon après double exécution ;
- journaliser création, média, variante et stock initial ;
- ne pas fabriquer de stock initial ;
- continuer après une erreur isolée et produire un rapport ;
- option de reprise ciblée ;
- `--dry-run` doit afficher créations, mises à jour, ignorés, médias manquants, conflits et vérifications humaines ;
- `--apply` doit demander une confirmation explicite ou un jeton d’exécution à usage unique ;
- aucune route publique d’import ;
- désactiver/supprimer le jeton après l’opération.

## CONTRÔLES APRÈS IMPORT

Vérifier :

1. tous les produits sont en brouillon ;
2. zéro prix, coût, stock ou code-barres inventé ;
3. aucune duplication ;
4. aucun produit n’apparaît sur le site public ;
5. chaque média appartient au bon produit ;
6. chaque source et droit d’image est enregistré ;
7. les vendeurs ne voient toujours pas les coûts et ne peuvent pas gérer le catalogue ;
8. la recherche, les filtres, les catégories et l’aperçu privé fonctionnent ;
9. le stock reste unique et commun ;
10. le journal d’activité contient l’import ;
11. `DEMO_MODE=false` et `SITE_INDEXABLE=false` restent inchangés ;
12. `robots.txt` reste `Disallow: /` et les pages restent `noindex, nofollow` ;
13. lint, TypeScript, formatage, tests métier, tests navigateur et build passent ;
14. un test réel est fait sur téléphone et ordinateur avec un produit brouillon ;
15. aucune erreur d’exécution n’apparaît après déploiement.

## LIVRABLE FINAL

À la fin, fournir un rapport en français comprenant :

- sauvegarde créée ;
- nombre de photos analysées ;
- nombre de produits créés ;
- nombre de variantes ;
- nombre de médias de boutique ;
- nombre de médias externes autorisés et leur provenance ;
- produits ignorés et raison ;
- produits nécessitant une identification ;
- informations humaines manquantes par produit ;
- résultats des tests ;
- PR, commit et déploiement ;
- confirmation que rien n’a été publié et que Google reste bloqué ;
- lien direct vers chaque brouillon dans le Comptoir.

Ne déclare jamais la mission terminée si le formulaire réel n’a pas été vérifié en production avec le compte propriétaire. Si tu ne disposes pas des identifiants, indique clairement `vérification humaine en production restante`.
