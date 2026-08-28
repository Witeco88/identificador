# REPARTIDOR TICKET SCANNER V5

V5 és un mòdul autònom pensat per publicar-se a GitHub Pages.

## Què fa
FOTO / SELECCIONAR FOTO -> preprocessament -> OCR local al navegador -> text + confiança + bounding boxes.

No hi ha backend de Ticket Scanner i la fotografia no es puja a cap API pròpia.

## GitHub Pages

1. Crea un repositori nou.
2. Puja el contingut d'aquest paquet a la branca `main`.
3. A GitHub: Settings -> Pages -> Source: GitHub Actions.
4. Fes push.
5. El workflow `.github/workflows/pages.yml` prepara automàticament Tesseract.js, els fitxers WASM i els models `cat`, `spa`, `eng`, `fra`, `ita`, `por` dins del desplegament.
6. Obre la URL HTTPS de GitHub Pages amb Safari.
7. Per instal·lar-la: Compartir -> Afegir a la pantalla d'inici.

## Important
El repositori font no necessita contenir els fitxers grans de Tesseract. El workflow els incorpora durant el build. Un cop desplegats, l'aplicació els serveix des del mateix domini i el Service Worker els va guardant a la memòria cau del navegador.

La primera publicació/build necessita Internet perquè GitHub Actions descarregui els components OCR.

## FASE
Aquesta versió continua sent FASE 1. Encara NO interpreta productes, IVA, servei, propina o total. Això es farà després de validar que foto -> OCR funciona.
