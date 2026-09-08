# User approval → release production

Maintain `workflow.json` beside the project. A useful approval record is:

```json
{
  "phase": "approved",
  "projectId": "orbit-lancer",
  "approval": {
    "romSha256": "actual 64-character SHA-256 of the user's tested ROM",
    "userDecision": "Actual user message judging this revision complete",
    "messageReference": "Available conversation/message reference or dated quotation"
  },
  "feedback": []
}
```

Never manufacture approval from automatic test success or silence. Resolve an ambiguous approval only if the accepted revision cannot be identified from context. `scripts/check-approval.cjs WORKFLOW.json ROM.gb` checks matching bytes and a recorded decision; it cannot authenticate conversation intent, which the agent must verify. If approved ROM bytes change, return to playtest rather than reuse approval. Packaging-only edits do not invalidate the gameplay approval.

## Original box and cartridge label

Use image generation for original illustration when available. Typeset title, copy, controls and compatibility separately; build exact geometry with vector/PDF tools. Never rely on image generation to set millimeter dimensions, glue tabs or trim/fold registration. Read the available PDF/image generation skills when doing that phase.

Use user-provided dimensions or a verified measured template. If absent, state proposed custom dimensions and allow adjustment: previously demonstrated box 100×125×22mm, label 42×37mm R2. These are NOT certified official box/shell dimensions. First print on plain paper at 100% and physically dry-fit. Account for paper thickness, tuck-tab clearance, glue, bleed (e.g. 2–3mm), printer margins and optional internal tray. Do not claim physical assembly was tested when only PDF dimensions were checked.

Deliver actual-size print PDFs, cut/fold guide, label sheet, a 50mm calibration mark, editable source and art. Render every PDF page to verify clipping, line registration, Japanese font embedding, copy accuracy and screenshots. If manufacturing requires CMYK/PDF-X, obtain the printer's requirements; a household RGB PDF is not automatically press-ready.

Write original copy grounded in the approved game: stage count, controls, scoring, save support, compatible modes. Do not copy reference-box characters, logos, story or barcode. Do not add unverified official endorsements, sale dates or publisher marks. Record image prompts and third-party font licenses.

## Promotional MP4

Default proposal: 30 seconds, 16:9, H.264/AAC, with actual gameplay as the majority of footage. Offer a vertical version if requested. A useful sequence is 0–3s title/key art, 3–12s normal shooting and weak-enemy chain, 12–21s later stage/boss pattern, 21–27s actual victory explosion/fanfare, 27–30s title and user-supplied CTA. Adapt to footage and game identity; this timing is not mandatory.

Capture the approved ROM and preserve its hash in the media manifest. Use nearest-neighbor integer scaling for GB pixels (for example 160×144→960×864 on a 1920×1080 canvas) with deliberate margins; do not stretch to widescreen. Background art and subtitles are optional. Keep BGM/SFX in sync, avoid clipping, and check beginning/middle/end plus the final encode. Do not deliver a static slideshow as gameplay footage or claim generated video is ROM output. ffmpeg can assemble real captures and artwork; if recording/encoding tools are unavailable, report that limitation and supply the editable shot plan rather than inventing a finished MP4.

Deliver ROM, browser trial, editable source, print PDFs, key art/label PNG, MP4, controls, notices, and a manifest of hashes, source revision, user-approved ROM, validation and physical-testing limits. Only publish/storefront-upload/social-post when authorized.
