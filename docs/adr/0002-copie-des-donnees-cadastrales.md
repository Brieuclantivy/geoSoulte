# Les contours et Contenances des Parcelles sont copiés dans la sauvegarde

Quand une Parcelle est ajoutée au Bien, on copie sa géométrie et sa Contenance depuis l'API cadastre dans les données du Bien (sauvegarde locale et export JSON), au lieu de ne garder que son identifiant et de la recharger à chaque ouverture. Les lignes de coupe et les Lots sont dessinés sur ces contours. Une mise à jour du cadastre (fusion, renumérotation, redessin) ne doit donc pas casser un Bien existant. Le fichier exporté est ainsi autonome et fonctionne hors ligne.

## Consequences

- Un Bien ne suit pas les mises à jour du cadastre : pour en profiter, il faut retirer puis rajouter les Parcelles.
