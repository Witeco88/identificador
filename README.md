# REPARTIDOR TICKET SCANNER V5.1

V5.1 corregeix el problema de V5 on `window.Tesseract` podia no existir perquè el fitxer local encara no havia estat generat/desplegat.

## Canvi principal

L'app ara:
- comprova els recursos OCR locals abans d'iniciar una lectura;
- verifica worker, els 4 builds de core i models lingüístics;
- mostra un diagnòstic explícit;
- usa `workerPath`, `corePath` i `langPath` absoluts respecte a GitHub Pages;
- només permet començar l'OCR quan el motor local està disponible;
- manté el progrés real per fases.

Tesseract.js v5 requereix que `corePath` apunti a un directori amb els quatre builds WASM/JS i que `langPath` sigui el directori dels `.traineddata.gz`. Aquesta és la configuració utilitzada aquí.

## Publicació

1. Crea un repositori nou.
2. Puja aquest paquet a `main`.
3. GitHub -> Settings -> Pages -> Source: GitHub Actions.
4. Espera que `Deploy Ticket Scanner V5.1` acabi en verd.
5. Obre la URL HTTPS amb Safari.
6. Prova primer `Diagnòstic del motor`.
7. Quan indiqui tots els recursos OCR com a `OK`, fes una fotografia.

## Nota

El build de GitHub Actions necessita Internet per obtenir els fitxers OCR. El desplegament resultant els serveix des del propi GitHub Pages; no depèn d'una API de Ticket Scanner.

Aquesta versió continua sent FASE 1: foto -> preprocessament -> OCR. Encara no interpreta productes, total, IVA, servei o propina.
