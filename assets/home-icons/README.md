# Home category models

The phone and Kia Ray inspired car are original procedural geometry in
`src/home-models.js`, rendered locally with Three.js 0.170.0 (MIT; license in
`assets/vendor/three-LICENSE.txt`). They use no downloaded model, photo or texture.

`phone.webp` and `ray.webp` are transparent static fallbacks generated from the
same geometry and camera. Regenerate with `node scripts/render-home-icons.mjs`
(Python 3 and Pillow are needed only for this offline authoring step). The
script also produces four-angle inspection images outside the deployment.

The models use warm-white clay, zero metallic reflectance, high roughness,
continuous bevel normals, and soft light-space/contact shadows.

The app loads the 3D module after startup and renders at up to 30 fps. Only the
selected card turns, once every 12 active seconds; deselected cards freeze at
their current angle, without ongoing rendering or shadow-map updates. It pauses when hidden or outside the viewport, uses
static posters for reduced motion, and falls back to them if WebGL is unavailable.
