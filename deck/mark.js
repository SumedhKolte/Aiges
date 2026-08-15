const sharp = require("sharp");
const fs = require("fs");
// The product's own shield, rasterised so the deck carries the same mark as the app.
const svg = (stroke, fill, check) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512">
  <path d="M16 2.8 26.3 6.7v8c0 6.4-4.2 11.9-10.3 14.3C9.9 26.6 5.7 21.1 5.7 14.7v-8L16 2.8Z"
        fill="${fill}" stroke="${stroke}" stroke-width="1.7" stroke-linejoin="round"/>
  <path d="m10.8 15.1 5.2 5 5.2-6.7" stroke="${check}" stroke-width="2.4"
        stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
(async () => {
  await sharp(Buffer.from(svg("#14C9B8", "rgba(20,201,184,0.14)", "#8DF4E8")))
    .png().toFile("mark.png");
  console.log("mark.png written");
})();
