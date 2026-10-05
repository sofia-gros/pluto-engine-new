export {};
const params = new URLSearchParams(window.location.search);
const backend = params.get('backend') ?? 'webgl2';

declare global {
  interface Window {
    __pluto: {
      backend: string;
      crossOriginIsolated: boolean;
    };
  }
}

window.__pluto = {
  backend,
  crossOriginIsolated: window.crossOriginIsolated,
};
