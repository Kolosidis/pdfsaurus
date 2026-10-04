import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    // Node code, plus browser globals for the functions passed to page.evaluate().
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
