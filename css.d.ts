// NativeWind processes global.css at build time via Metro, but nothing in its
// type packages actually declares "*.css" as an importable module -- without
// this, `import '../global.css'` fails typecheck even though it works at runtime.
declare module '*.css';
