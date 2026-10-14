// Dev-only UI gate. Real devices/browsers define __DEV__ via Metro;
// Node test harnesses set NODE_ENV=test. Production builds default to false.
declare const __DEV__: boolean | undefined;

const isDev =
  typeof __DEV__ !== "undefined"
    ? __DEV__
    : typeof process !== "undefined" && process.env?.NODE_ENV === "test";

export const DEV: boolean = isDev;
