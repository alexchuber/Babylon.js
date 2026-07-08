/**
 * Ambient declarations for Vite's asset-URL imports (e.g. `import url from "foo?url"`), which resolve
 * to the served asset URL as a string. Mirrors the relevant part of `vite/client`.
 */
declare module "*?url" {
    const url: string;
    export default url;
}
