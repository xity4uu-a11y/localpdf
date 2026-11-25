# Contributing to localpdf

Thanks for taking the time to look at `localpdf`. The goal of the project is simple: keep a fast, privacy-respecting PDF editor that runs completely inside a browser tab with zero backend services and zero external tracking.

## Local Setup

```bash
npm install
npm run dev
```

Before opening a pull request, run all local checks:

```bash
npm run validate-plugins
npm run typecheck
npm test
npm run build
```

## Adding a Community Preset Plugin

Preset manifests live in `plugins/*.json` and must validate against `plugins/schema.json`.

1. Copy an existing manifest such as `plugins/invoice-header-preset.json`.
2. Give your manifest a unique kebab-case `id`, clear `description`, `defaults`, optional `fontAliases`, and at least one preset action under `presets`.
3. Import and export it in `src/lib/presets.ts` if you want it bundled in the default UI drawer.
4. Run `npm run validate-plugins` and `npm test` to confirm schema compliance.

## Guidelines

- **Keep everything client-side:** Never introduce remote font CDNs, external worker URLs, analytics, or upload endpoints. Everything in `dist/` must function offline.
- **Test with real PDF bytes:** Engine changes in `src/lib/` should add or update real `pdf-lib` tests in `tests/pdfEditor.test.ts` rather than mocking away PDF writing.
- **Minimalist UI:** Keep controls clean, accessible, light/dark theme compatible, and free of visual clutter.
- **Legitimate use cases:** Documentation, samples, and presets should focus on editing your own documents (invoices, resumes, proposals, handouts, and templates).
