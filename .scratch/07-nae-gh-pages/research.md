# Research: Deploy the Node Assets Editor to GitHub Pages

Status: resolved

## Recommendation

Deploy directly from `alexchuber/Babylon.js` with a GitHub Actions workflow on
`dev`. A separate repository would add source synchronization or committed build
artifacts without simplifying the deployment. The resulting project-site URL is:

`https://alexchuber.github.io/Babylon.js/`

## Build

The application is the `@tools/node-assets-editor` workspace under
`packages/tools/nodeAssetsEditor`. Its deployment build writes to `dist/`
(`packages/tools/nodeAssetsEditor/package.json:2-13`).

A clean runner needs these commands:

1. `npm ci` to install the monorepo and run its asset-generation lifecycle
   (`package.json:58-59,73-75,114`).
2. `npm run build -w @tools/viewer` because the editor resolves the viewer from
   `packages/tools/viewer/dist/tsbuild`
   (`packages/tools/nodeAssetsEditor/vite.config.ts:8-10,50-63`;
   `packages/tools/viewer/tsconfig.build.json:1-20`).
3. `npm run build:deployment -w @tools/node-assets-editor` to produce the static
   site (`packages/tools/nodeAssetsEditor/package.json:5-13`).

A local clean build produced a self-contained 44 MB `dist/` directory. The
editor's worker dependencies and sample assets use Vite `?url` imports, so their
WASM, JavaScript, image, and model files are copied into the build
(`packages/tools/nodeAssetsEditor/src/nodeAssets/nodeAssetBuildWorkerResources.ts:4-9`;
`packages/tools/nodeAssetsEditor/src/nodeAssets/defaultSampleAssets.ts:8-10`).

## GitHub Pages compatibility

The shared Vite configuration already uses `base: "./"`, making generated asset
references relative. No repository-name-specific base URL or application change
is required for the `/Babylon.js/` project-site path
(`packages/public/viteToolsHelper.mjs:262-270`).

GitHub's supported custom-workflow path is to upload the static output with
`actions/upload-pages-artifact` and deploy it with `actions/deploy-pages`. The
deployment job needs `pages: write` and `id-token: write`, and should target the
`github-pages` environment:

- [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Official static Pages starter workflow](https://github.com/actions/starter-workflows/blob/main/pages/static.yml)
- [`actions/deploy-pages` security requirements](https://github.com/actions/deploy-pages#security-considerations)
- [`actions/upload-pages-artifact` artifact requirements](https://github.com/actions/upload-pages-artifact#artifact-validation)

As of 2026-07-13, the current major releases are `actions/checkout@v7`,
`actions/setup-node@v6`, `actions/configure-pages@v6`,
`actions/upload-pages-artifact@v5`, and `actions/deploy-pages@v5`, according to
each action's official GitHub Releases page.

## One-time owner action

In the fork, select **Settings → Pages → Build and deployment → Source → GitHub
Actions**. Once the workflow exists on `dev`, a push to `dev` builds and publishes
the editor. Later pushes keep the shared site synchronized with that branch.
