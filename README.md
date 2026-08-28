# Repartidor Ticket Scanner V5.5.1

V5.5.1 incorpora:
- Fer foto amb càmera de l'iPhone.
- Seleccionar fotografia existent sense demanar permís de càmera.
- Progrés visible.
- Reconstrucció de línies amb bounding boxes OCR.
- TOTAL com a frontera dura.
- Cap contingut posterior al TOTAL pot convertir-se en producte.
- Detecció de Totaal i errors OCR habituals.
- Detecció de total implícit només quan coincideix matemàticament amb els productes anteriors.
- Quantitats i imports.
- Revisió i exportació JSON.
- Diagnòstic.

Cas de regressió crític:
Habanero 15.00; Truffel Burger 15.00; Lams Burger 15.50; Verse Friet 4.00; Chipotle mayonaise 1.00; Brand Halve Liter 7.20; LaChouffe 5.70; Appelsap 2.50; TOTAL 65.90.
Tot el que aparegui després del TOTAL s'ha d'ignorar.

## V5.5.1 — correcció del cas De Burger
- Agrupació vertical OCR més tolerant.
- Reconstructs `nom` + `import` quan Tesseract separa l'import en una fila.
- Accepta imports amb espais al voltant del separador decimal.
- Reconeix explícitament `Totaal`.
- Si `Totaal` i l'import apareixen en files OCR separades, els combina abans d'aplicar la frontera.
- Manté la regla: després del TOTAL no es creen productes.

## V5.5.1 — motor geomètric i frontera TOTAL
- Selecció de TOTAL basada en etiqueta, posició i estructura.
- TOTAL explícit és frontera espacial: les línies posteriors no poden ser PRODUCT.
- Detecció d'un total implícit només si encaixa matemàticament amb els productes anteriors.
- Exclusió explícita de zones fiscals/pagament/footer.
- Validació productes + impostos + servei + propina - descomptes contra TOTAL.
- Diagnòstics del candidat de total i de les línies ignorades després del total.

## V5.5.1 — OCR multilingüe europeu
- OCR local amb català, castellà, anglès, neerlandès, francès, alemany, italià i portuguès.
- Diccionari de conceptes econòmics multilingüe i tolerant a errors OCR.
- `Totaal`, `Gesamt`, `Totale`, `Total TTC`, `MwSt`, `BTW`, etc. es tracten com a conceptes estructurals, no productes.
- Diagnòstic ampliat per comprovar tots els models lingüístics.
- Es manté la frontera espacial del TOTAL i la validació matemàtica.
