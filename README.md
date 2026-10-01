# Absorber — Simulation

Live-Simulation einer CO₂-Absorption (Luft/Wasser) in einer Gegenstrom-Kolonne mit N Trennstufen, im Ohm-Corporate-Design (Fakultät Angewandte Chemie).

**Live:** https://corinnabusse.github.io/absorber-app/

## Funktionen

- **Dynamisches Stufenmodell:** Kaskade aus N Stufen (2–10), live per Euler-Verfahren integriert. Die Trägheit entsteht durch den Flüssigkeits-Holdup je Stufe:
  `H_L·dxⱼ/dt = L·x₍ⱼ₊₁₎ + G·y₍ⱼ₋₁₎ − (L + G·m)·xⱼ`
- **Stationärer Vergleichswert:** Kremser-Gleichung mit Absorptionsfaktor `A = L/(m·G)`, als gestrichelte Linie im Diagramm.
- **Live einstellbar:** Luftvolumenstrom G, Wasservolumenstrom L, CO₂-Volumenstrom, Verteilungskoeffizient m (vereinfachtes Henry-Gesetz `y* = m·x`).
- **Simulierte Messung:** CO₂-Gehalt der Abluft mit einstellbarem Messrauschen und Messintervall.
- **Zeitraffer:** Beschleunigung bis ×2000.
- **Kolonnen-Animation:** Stufenfärbung nach CO₂-Beladung des Wassers.
- **Diagramm:** Zoom per Ziehen oder Mausrad.
- **CSV-Export:** Messreihe, Modellwerte, Parameter und aktuelles Stufenprofil (Semikolon-getrennt, Dezimalkomma, Excel-kompatibel).

Die Trennstufenzahl N wird beim Start gesperrt und lässt sich erst nach „Neuer Lauf“ wieder ändern.

## Schnellstart

```bash
npm install
npm run dev
```

## Produktions-Build

```bash
npm run build
npm run preview
```

## Deployment

Jeder Push auf `main` baut die App per GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) und veröffentlicht sie auf GitHub Pages. Der Basispfad `/absorber-app/` ist in [vite.config.js](vite.config.js) gesetzt.

## Technik

React 18 · Vite 5 · Tailwind CSS 4 · Recharts
