# Unused public assets

Images and files in this folder are not currently referenced anywhere in the
Next.js app. They were moved here on 2026-05-24 to declutter `web/public/`
without deleting (in case any are wanted later — e.g. csgologo for legacy
content, or the Dota teaser for a future landing-page hero).

Files in this folder are NOT served at predictable URLs the app is using.
If you need to use one, move it back up to `web/public/` and add the
reference in the app.

Vercel still ships these in the deploy bundle (Next.js bundles every file
in `public/` regardless of nesting). That's fine for now — total weight is
~2 MB. If bundle size becomes a concern, delete the unused ones.
