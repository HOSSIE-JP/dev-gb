# v0.5 Image Gen source prompts

Generated with the built-in Image Gen tool. Six separate calls, no external illustration inputs. Touhou Project character identities belong to their original rightsholders. Source images are converted by `convert-v05.py`; original images are retained unchanged.

## cirno-sheet.png
Create one game asset reference sheet for Cirno from Touhou Project, cute ice fairy with short bob hair, big hair bow, sleeveless dress over blouse, jagged crystalline wings. Monochrome grayscale, pure black backdrop, bold clean anime outlines and simple cel shades suited to reduction into Game Boy 4 gray pixels. Three clearly separated panels horizontal: left a normal full body standing portrait smiling confidently, middle a defeated full body standing portrait pouting adorably, right a miniature front facing flying combat sprite with wings spread. Full figures entirely contained, consistent design, no text, no frames, no gradients, no other characters. High contrast delicate expressive face with readable eyes.

## ending-cirno.png
Create a cute Touhou Project game ending illustration of Cirno, smiling proudly and holding a tiny ice crystal near her face, short light blue hair, big blue ribbon, crystalline fairy wings, blouse and blue dress. Face and shoulders very large in frame, centered symmetrical close up, the face should fill middle half of the frame, cheerful expressive sparkling eyes. 10:9 landscape composition, designed for Game Boy conversion to 160x144 and four gray shades. Bold clean anime linework, flat monochrome cel shading, black backdrop with just two simple snowflakes in corners, no gradients, no text. Charming polished anime illustration.

## ending-meiling-patchouli.png
One Touhou Project cute game ending illustration. Hong Meiling and Patchouli Knowledge sitting together sharing tea, both happy gentle smiles, large expressive adorable faces, head and shoulders close-up side by side, both faces entirely in the middle of composition and fill most of screen. Meiling wears Chinese cap with star and has long braided hair; Patchouli wears frilled nightcap with crescent moon, long hair, ribboned librarian dress. Landscape 10:9. Bold simple anime linework and flat monochrome four gray cel shading on nearly black background, tiny tea steam decoration only, avoid detailed environment. Designed to remain recognizable at Game Boy 160x144. No text. Polished charming anime illustration.

## ending-sakuya-remilia.png
One Touhou Project game ending illustration: Sakuya Izayoi and Remilia Scarlet happily close together, cute large smiling faces, head-and-shoulders close up side by side. Sakuya short silver hair with small braids and maid headband, Remilia short pale hair with frilly mob cap and bow and small bat wings. Faces dominate frame, gentle adorable eyes. Landscape 10:9 composition. Clean thick anime outlines, flat monochrome four gray cel shades, mostly black simple backdrop with one small moon in corner. Designed for legibility reduced to Game Boy 160x144 resolution. No text, no gradient, polished cute portrait.

## ending-flandre.png
One Touhou Project cute ending portrait of Flandre Scarlet, innocent cheerful open smile, large expressive adorable face and shoulders close up, short light blonde hair with side ponytail, frilly cap and ribbon, red vest over blouse, iconic crystal prism wings visible beside shoulders. Face occupies most of image, centered, very cute eyes. Landscape 10:9 for eventual Game Boy 160x144 reduction. Monochrome four gray flat cel shades, clean bold anime outline, mostly black backdrop with a few simple star shapes, no text, no gradients. Polished anime character illustration.

## lake.png
Game Boy vertical scrolling shoot em up background source art, overhead top-down misty frozen lake approaching a distant gothic mansion. Portrait 5:8 composition, monochrome grayscale pixel friendly anime game background, four flat shade groups, very dark central water with low contrast ripple shapes scattered throughout the center, ice floes reeds and snowy rocks framing edges, distinct variations from bottom lake shore to upper mist, no characters no projectiles no text no interface. Clean chunky shapes and readable simple edges suited to 160x256 downsampling and limited 8x8 tile palette. Low contrast central details so bright sprites remain visible.

## Conversion notes
- Endings preserve the central eye/mouth tile region; surroundings are clustered into representative original tiles to remain within 255 tiles.
- Cirno's combat frame is 24x24. Normal and defeated portraits are composed with the unchanged v0.3 Reimu portraits.
- Lake uses 96 background tiles and 8 animated central ripple tiles. Palette6 is shared with the existing fairies due to the eight-palette hardware limit.
- `title-pixels.json` is a 238-tile reduction of the existing title artwork, providing room for the new SELECT instruction without changing the composition.
