# fonts/

pdfmake (used by `src/lib/pdf/pdfGenerator.ts`) needs real .ttf font files
at runtime — they are binary files and intentionally not included in this
skeleton. Before PDF export will work, download the Roboto font family
(OFL-licensed, freely usable) and place these four files directly in this
folder:

- Roboto-Regular.ttf
- Roboto-Medium.ttf
- Roboto-Italic.ttf
- Roboto-MediumItalic.ttf

Source: https://fonts.google.com/specimen/Roboto (download family, pick the
Regular, Medium, Italic, and Medium Italic weights).

Deploying to Render (or any host that builds from a git push): commit these
four .ttf files directly to the repo. Roboto is OFL-licensed, so there's no
licensing issue with checking in the binaries. Render only has access to
what's in your git history — files sitting locally but excluded via
.gitignore will silently be missing on deploy, causing PDF export to fail
at runtime with an ENOENT looking for these files. .gitignore in this
project does NOT exclude fonts/*.ttf for this reason; just `git add` them
like any other file.
