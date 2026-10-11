/** Touch devices (phones, tablets) get a lighter render path: fewer filter samples, fewer lights, smaller buffers. */
export const MOBILE=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
