// Dev-only UI gate. Real devices/browsers always define __DEV__ via Metro;
// unknown runtimes (e.g. Node harnesses importing screens) default to visible
// so nothing is silently hidden during tests.
declare const __DEV__: boolean | undefined;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const isDev = typeof __DEV__ !== "undefined" ? __DEV__ : true;
export const DEV: boolean = isDev;
