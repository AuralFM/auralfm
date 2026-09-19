/** Just enough of node:path for modules that build file names. */
export const join = (...parts) => parts.filter(Boolean).join("/").replace(/\/+/g, "/");
export const dirname = (p) => String(p).split("/").slice(0, -1).join("/") || ".";
export const basename = (p) => String(p).split("/").pop();
export default { join, dirname, basename };
