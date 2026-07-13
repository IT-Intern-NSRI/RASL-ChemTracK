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

This folder is gitignored for the .ttf files themselves (see root
.gitignore) so the repo doesn't carry binary font assets — re-download them
on each new environment/deploy, or bundle them into your Docker image if you
containerize the app.
