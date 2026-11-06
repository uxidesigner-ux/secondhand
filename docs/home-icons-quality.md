# Home icon refinement — v1.7.1

The first models had strong blue/black contrast, narrow faceted bevels, many small
surface decorations, and little contact shading. At mobile size these features
read as hard toy parts rather than a cohesive product maquette. Both cards also
animated continuously, making selection less distinct.

The revision uses warm-white clay with neutral gray insets, no metallic or
emissive surfaces, and high roughness. Wider bevels and continuous normals soften
the silhouettes. Camera rings and tyres now have rounded cross-sections; the
car's roof and body form one shell. Small coloured accents and ornamental lines
were removed. A rounded white plinth, warm studio lights, soft shadow maps, and
a subtle ground-contact gradient give the models a shared material treatment.

Only the card whose button has `aria-pressed="true"` rotates. Each model retains
its own angle, and deselection immediately stops both its animation and shadow
updates. Same-selection renders keep the current phase. Hidden pages, offscreen
cards, reduced motion and WebGL failures retain the existing pause/fallback
behaviour. Geometry is still combined by material for a small draw-call count.

Validation covers selection changes and pause/resume lifecycle, 36 rotation
angles in the narrowest icon viewport, and four-view offline geometry renders.
The offline renderer smooths vertex illumination and computes soft shadows for
the transparent fallback posters. It approximates WebGL lighting; it does not
substitute for a device/browser visual test.
