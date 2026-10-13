/**
 * Textes proposés pour GPS. Ils sont rédigés sans affirmer de fait non fourni
 * (adresse, durée de garantie, opérateur, tarif) : le propriétaire les applique
 * depuis le Comptoir, les relit et les ajuste avant de les enregistrer.
 */
export const proposals = {
  storeText:
    "Au comptoir GPS, on prend le temps. Vous voyez les produits en vrai, on vous conseille sur le bon modèle, la bonne capacité ou la bonne pointure, et vous repartez avec un article vérifié devant vous. C'est aussi là que vous retirez vos commandes confirmées et que vous utilisez nos services de transfert d'argent.",
  aboutText:
    "GPS — Global Public Services est né d'une idée simple : réunir au même endroit les produits du quotidien et les services dont on a besoin, avec un accueil qui rassure.\n\nTéléphones, écouteurs, casques, chargeurs, accessoires, lunettes, chaussures : nous choisissons des articles que nous pouvons expliquer et défendre. Au comptoir, vous trouvez aussi nos services de transfert d'argent.\n\nNotre promesse tient en une phrase, notre slogan : le service qui rassure. Une réponse claire, un prix annoncé, une commande confirmée avant d'être préparée.",
  focusText:
    "Notre coup de cœur du moment : un article choisi au comptoir pour son rapport qualité-prix. Choisissez votre option, envoyez votre commande sur WhatsApp, GPS vous confirme la disponibilité.",
  pickupDetails:
    "Retrait au comptoir GPS aux heures d'ouverture, dès que GPS vous a confirmé que votre commande est prête. Présentez la référence de commande reçue sur WhatsApp.",
  deliveryDetails:
    "Livraison selon votre zone. Les frais et le délai vous sont confirmés par GPS sur WhatsApp avant la préparation de la commande.",
  warranty:
    "Les produits neufs bénéficient de la garantie de leur fabricant lorsqu'elle s'applique. En cas de problème, venez au comptoir avec votre reçu : GPS examine l'article avec vous et vous accompagne dans les démarches. Pour les articles reconditionnés ou d'occasion, les conditions sont précisées au moment de l'achat.",
  returns:
    "Un article ne vous convient pas ? Parlez-en à GPS rapidement, reçu à l'appui. L'article doit être complet et en bon état. Après vérification au comptoir, GPS vous propose un échange ou un remboursement selon la situation.",
  payment:
    "Aucun paiement n'est demandé sur le site. Le règlement se fait au comptoir ou à la livraison ; les moyens de paiement acceptés vous sont confirmés par GPS avec votre commande.",
  receiptFooter: "Merci pour votre confiance. Conservez ce reçu : il vous sera demandé pour toute réclamation.",
  serviceSummary:
    "Envoyez ou recevez de l'argent au comptoir GPS, accompagné par un conseiller. Munissez-vous d'une pièce d'identité en cours de validité.",
  serviceOperations: "Envoi d'argent, réception d'argent",
} as const;

export type ProposalKey = keyof typeof proposals;
