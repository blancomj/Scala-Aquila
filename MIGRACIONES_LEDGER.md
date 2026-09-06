# Ledger de continuidad de migraciones

Ver `Casos de uso/Tres Modulos/HOJA_DE_RUTA.md` §4. Antes de la primera migración de un corte, lee
la última fila; usa timestamps estrictamente posteriores al «último timestamp usado». Al cerrar el
corte, añade una fila nueva con el primer y el último timestamp realmente usados y la fecha de
cierre.

| Corte | Primer timestamp usado | Último timestamp usado | Cerrado el |
|---|---|---|---|
| (base) | — | 20260930150000 | — |
| CO-1 | 20260930160000 | 20260930170000 | 2026-09-05 |
| CO-2 | 20260930180000 | 20260930220000 | 2026-09-05 |
| CO-3 | 20260930230000 | 20260930270000 | 2026-09-05 |
| MANT-0 | 20260930280000 | 20260930350000 | 2026-09-05 |
| CO-4 | 20260930360000 | 20260930390000 | 2026-09-06 |
| CO-7 | 20260930400000 | 20260930430000 | 2026-09-06 |
| CO-5 | 20260930440000 | 20260930510000 | 2026-09-06 |
| CO-6 | 20260930520000 | 20260930650000 | 2026-09-06 |
