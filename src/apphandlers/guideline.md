# apphandlers

This guideline is adding more specific requirements base on src/guideline.md, all rules and conventions and styles apply to every file in current directory (src/handlers/*.ts).

All functions handling application level events should be put in this directory.
All functions from files in this directory (src/apphandlers/*.ts) will be exported and be called by codes in ./index.ts.
All functions exported from ./index.ts will be called or attached for event handling by codes in src/app.ts.
