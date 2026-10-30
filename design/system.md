# Calc3D design system
Extracted from the existing application. Product register: a Chilean 3D-printing cost tool; existing warm dark surfaces, practical comparisons and CLP amounts. No new brand palette or font is introduced.

## Colors
| Token | Value | Usage | Source |
|---|---|---|---|
| --bg | #202321 | Page canvas | src/styles.css :root; src/auth.css; src/purchases.css; src/users.css |
| --panel | #292d2a | Grouped content | Same four sources |
| --line | #454a45 | Quiet separators | Same four sources |
| --text | #f2f0e8 | Main text | Same four sources |
| --muted | #b9beb8 | Supporting labels | Same four sources |
| --accent | #dcb98c | Focus, selected controls and actions | Same four sources |
| --error | #ffd2c8 | Errors | Same four sources |
| control surface | #303531 | Inputs and secondary surfaces | src/styles.css input; src/users.css input |
| control border | #666e65 | Input outline | src/styles.css input; src/users.css input |
| notice surface | #30342f | Notes | src/styles.css .notice |
| accent text | #242824 | Text on accent button | src/styles.css .primary |

## Typography
- System stack: system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif (all four sources).
- Body: 14px, line height 1.3–1.45 (src/styles.css, src/users.css).
- Main headings: 21px/1.25, weight 700; section headings 16px/650 (src/styles.css, src/users.css).
- Supporting text: 11px eyebrow, 12px hints, 13px controls (src/styles.css).
- Monetary values: tabular numerals (src/styles.css .result-row strong).
- Emphasized values: 22px (src/styles.css .sale-total strong).

## Geometry
- Existing spacing: 4, 6, 8, 10, 12, 14, 16, 20, 24, 40px (src/styles.css, src/users.css).
- Radius: 4px small controls, 6px fields/buttons/panels, 7px result panels, 8px auth panels (same sources).
- Main content maximum: 1440px, with 20–24px page gutters (src/styles.css .shell).
- Minimum interactive target: 44px (all source files).
- No decorative shadows are specified by these sources. Keep this surface flat.

## Component rules
- Page navigation remains normal links, not an overlay.
- Search and filter labels remain visible. Inputs use the control surface and border above.
- Focus uses a 3px accent outline, offset 2–3px (src/styles.css, src/users.css).
- Use plain dividers for dense records; avoid nested cards.
- Use existing brand metadata only for brand indicators; do not invent filament HEX samples.
- Read-only supplier references must show their pending state and must not imply a known weight or CLP/kg.
- Match existing Spanish project copy and es-CL formatting.
- Responsive references: 560px and 900px in src/users.css; 750px and 1050px in src/styles.css. Keep narrow screens free of horizontal overflow.
- Respect prefers-reduced-motion (src/auth.css).

## Artboard self-check
Only the values in the color table and the system font stack may be used by design artboards. Transparent/inherited colors are allowed. Actual monetary/product facts in mockups are illustrative source samples, not a claim that the full catalog is already imported.
