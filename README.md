# Repartidor Ticket Scanner V5.7.1

V5.7.1 incorpora:
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

## V5.7.1 — correcció del cas De Burger
- Agrupació vertical OCR més tolerant.
- Reconstructs `nom` + `import` quan Tesseract separa l'import en una fila.
- Accepta imports amb espais al voltant del separador decimal.
- Reconeix explícitament `Totaal`.
- Si `Totaal` i l'import apareixen en files OCR separades, els combina abans d'aplicar la frontera.
- Manté la regla: després del TOTAL no es creen productes.

## V5.7.1 — motor geomètric i frontera TOTAL
- Selecció de TOTAL basada en etiqueta, posició i estructura.
- TOTAL explícit és frontera espacial: les línies posteriors no poden ser PRODUCT.
- Detecció d'un total implícit només si encaixa matemàticament amb els productes anteriors.
- Exclusió explícita de zones fiscals/pagament/footer.
- Validació productes + impostos + servei + propina - descomptes contra TOTAL.
- Diagnòstics del candidat de total i de les línies ignorades després del total.

## V5.7.1 — OCR multilingüe europeu
- OCR local amb català, castellà, anglès, neerlandès, francès, alemany, italià i portuguès.
- Diccionari de conceptes econòmics multilingüe i tolerant a errors OCR.
- `Totaal`, `Gesamt`, `Totale`, `Total TTC`, `MwSt`, `BTW`, etc. es tracten com a conceptes estructurals, no productes.
- Diagnòstic ampliat per comprovar tots els models lingüístics.
- Es manté la frontera espacial del TOTAL i la validació matemàtica.

## V5.7.1 — recuperació de l'última línia de producte
- No s'elimina una línia simplement perquè estigui immediatament abans del TOTAL.
- Les files amb nom plausible + import abans de la frontera TOTAL són candidates a PRODUCT.
- Si la suma queda curta, es revisen les últimes files excloses i es recuperen quan tanquen matemàticament amb el TOTAL.
- El diagnòstic indica quan una línia ha estat recuperada per validació matemàtica.

## V5.7.1 — correcció de l'última línia abans del TOTAL
La selecció de productes ara manté les files amb text + import abans de la frontera TOTAL i recupera una fila immediatament anterior si el seu import tanca matemàticament el TOTAL.

## V5.7 — reparació de JavaScript i caché
- Corregida la declaració duplicada de `productCandidates` que impedia executar `app.js`.
- Verificat amb `node --check`.
- Service Worker amb caché `ticket-scanner-v5-6-2`, eliminació de caches antigues i `skipWaiting`/`clients.claim`.
- Recursos principals amb cache-busting `?v=5.7`.

## V5.7 — Enhanced OCR
- Tesseract continua sent el motor local principal.
- S'afegeix PaddleOCR.js (PP-OCRv5) com a segon motor opcional al navegador.
- El segon motor només s'intenta quan la confiança o la validació indiquen risc.
- Els resultats es fusionen conservant text, score i geometria.
- Si PaddleOCR no es pot carregar, l'aplicació continua amb Tesseract.
- No s'envien fotografies a un servidor propi; la inferència del segon motor es fa al navegador, tot i que els fitxers de la llibreria/model es carreguen des del CDN.

## V5.7.1
- Versió corregida i unificada a V5.7.1.
- Eliminades referències de versió 5.6.x dels fitxers de l'aplicació.
- Service Worker amb cache `ticket-scanner-v5-7-1`.
- Eliminació explícita de caches antigues.
- `skipWaiting()` i `clients.claim()` per accelerar l'actualització.
- Recursos principals amb cache-busting `?v=5.7.1`.
- PaddleOCR.js/PP-OCRv5 continua com a segon motor opcional; Tesseract continua com a fallback. citeturn0search1turn0search5
