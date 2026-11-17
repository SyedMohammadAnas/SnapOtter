# Product: Konvertt

Konvertt is a public web app for converting, compressing, resizing, OCR-ing and otherwise processing files (image, video, audio, PDF, documents). It is a Konvertt-branded front end over a self-hosted SnapOtter engine that runs on the owner's homelab. Files stay on the owner's hardware.

## Decisions (2026-11-17, owner interview)

- **Tone:** calm and professional. Light surfaces, minimal chrome, quiet confidence. Not playful, not dark-and-neon.
- **Audience:** public visitors converting files. Onboarding and clarity matter most. Power features stay reachable but must not crowd the first screen.
- **Scope:** keep every SnapOtter feature (editor, pipelines, batch, admin). Improve the UI, do not remove capabilities.
- **Login:** SnapOtter's own accounts (admin and users).
- **Uploads:** direct to the homelab disk, not Vercel Blob.
- **Brand:** the product is named Konvertt. SnapOtter is the engine and must stay credited ("Powered by SnapOtter", AGPL-3.0).

## Mode

Operate (task completion: tools, editor, batch, settings) with a Persuade-level first impression on the landing and login screens.

## Constraints

- AGPL-3.0: this fork must stay public while the modified UI is served.
- Keep SnapOtter's accessibility, i18n (21 languages) and keyboard behaviour.
- Icons: use the existing icon library (lucide-react) in one consistent stroke weight.
- Do not add decorative gradients, glass effects or hard offset shadows.
