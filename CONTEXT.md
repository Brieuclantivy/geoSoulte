# geoSoulte

Outil indicatif, destiné à des particuliers, pour simuler le découpage géométrique de parcelles du cadastre officiel (principalement agricoles) entre plusieurs personnes, et visualiser ce que chacun obtient et paie. Malgré le nom, aucune soulte n'est calculée.

## Language

**Parcelle**:
Une parcelle du cadastre officiel, identifiée par son identifiant cadastral (commune + préfixe + section + numéro).
_Avoid_: terrain, lot (quand on parle de la parcelle d'origine)

**Bien**:
L'ensemble des Parcelles qu'un groupe d'Acquéreurs envisage d'acheter et de découper ; ses parties peuvent ne pas se toucher.
_Avoid_: terrain, propriété, unité foncière

**Tènement**:
Un groupe de Parcelles contiguës au sein du Bien ; un Bien compte un ou plusieurs Tènements.
_Avoid_: îlot (réservé au RPG), zone, terrain

**Acquéreur**:
Une personne du groupe qui achète une partie du Bien.
_Avoid_: participant, héritier, propriétaire

**Objectif**:
La cible d'un Acquéreur, exprimée au choix en surface (ha) ou en budget (€). Facultatif : si aucun Acquéreur n'en a, le Découpage automatique partage le Bien à parts égales (en Coût si toutes les Parcelles ont un prix, sinon en Surface cadastrale), et cette part égale tient lieu d'Objectif dans le bilan.
_Avoid_: quota, part souhaitée

**Lot**:
Un morceau du Bien issu du Découpage, attribué à exactement un Acquéreur. Un Acquéreur peut avoir plusieurs Lots ; le Découpage automatique attribue toute la surface du Bien, sans partie commune. Pendant l'ajustement à la main, un Lot peut rester provisoirement « Non attribué » (hachuré, signalé par un avertissement).
_Avoid_: part, portion, parcelle (un Lot n'est pas une Parcelle cadastrale)

**Lot enclavé**:
Un Lot qui ne touche ni une route ni un chemin praticable (à 5 m près), ni directement ni par un autre Lot contigu du même Acquéreur. Ce n'est qu'une alerte d'après la BD TOPO de l'IGN, pas une analyse des servitudes.
_Avoid_: lot sans issue, lot inaccessible

**Découpage**:
La division du Bien en Lots, proposée automatiquement et/ou ajustée à la main.
_Avoid_: partage, division, sous-division

**Scénario**:
Une variante nommée du Découpage d'un Bien ; un Bien peut avoir plusieurs Scénarios.
_Avoid_: version, simulation, variante

**Contenance**:
La surface officielle d'une Parcelle inscrite au cadastre.
_Avoid_: superficie

**Surface cadastrale**:
La part de Contenance couverte par un Lot : somme, sur chaque Parcelle qu'il recouvre, de la fraction mesurée de la Parcelle × sa Contenance. C'est sur elle que sont jugés les Objectifs en hectares.
_Avoid_: surface corrigée, surface recalée

**Surface mesurée**:
La surface calculée à partir de la géométrie (d'une Parcelle ou d'un Lot) ; diffère généralement un peu de la Contenance, les deux sont affichées.
_Avoid_: surface réelle, surface SIG

**Attribution verrouillée**:
Un Tènement imposé à un Acquéreur par l'utilisateur, conservé quand le Découpage automatique est relancé (contrairement aux lignes de coupe).
_Avoid_: épingle, forçage

**Valeur**:
Le prix en euros d'une Parcelle, exprimé à l'hectare et/ou en total pour le Bien, saisi par l'utilisateur.
_Avoid_: estimation

**Prix de référence**:
Le prix à l'hectare des ventes récentes de terres non bâties d'une commune (médiane et quartiles des Demandes de valeurs foncières, par nature de culture). Ce n'est qu'une aide à la saisie de la Valeur, jamais appliqué tout seul ni enregistré.
_Avoid_: estimation, prix du marché, valeur DVF

**Coût**:
Ce que paie un Acquéreur pour un Lot, déduit de la Valeur des surfaces qu'il couvre.
_Avoid_: prix (réservé à la saisie), quote-part

**Soulte**:
Hors périmètre : le mot n'apparaît que dans le nom du projet, rien n'est calculé.
