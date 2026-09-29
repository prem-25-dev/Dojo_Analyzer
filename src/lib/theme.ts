export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "dojo-theme";

/**
 * Runs before first paint (inlined in the root layout) so a saved dark theme
 * never flashes light. Light is the default when nothing is stored.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
