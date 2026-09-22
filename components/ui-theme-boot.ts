/**
 * Applies the saved light/dark choice before first paint. Lives in a plain
 * module (not the "use client" toggle) so the server layout imports the
 * actual string rather than a client reference.
 */
export const UI_THEME_KEY = "ff:ui-theme";
export const UI_THEME_BOOT = `try{var t=localStorage.getItem("${UI_THEME_KEY}");if(t==="light")document.documentElement.dataset.ui="light"}catch(e){}`;
