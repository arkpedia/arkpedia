import Module from 'node:module';

/**
 * Lets a test import a component that imports a CSS module (StyledSelect.module.css):
 * Next compiles those, Node would parse them as JavaScript. Each class name reads as its
 * own key, so markup stays deterministic. Import this before the component.
 */
const extensions = (Module as unknown as { _extensions: Record<string, (module: { exports: unknown }) => void> })._extensions;
extensions['.css'] = (module) => {
  module.exports = new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : String(key)) });
};
