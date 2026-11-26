/** Last frame of the carousel, shown by the product page until its own 3D is live. */
let shot: string | null = null;
export const setHandoff = (url: string) => {
  shot = url;
};
export const peekHandoff = () => shot;
export const clearHandoff = () => {
  shot = null;
};
