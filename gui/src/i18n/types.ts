import { zhCopy } from "@/i18n/locales/zh";

type WidenCopy<T> = T extends (...args: infer Args) => string
  ? (...args: Args) => string
  : T extends string
    ? string
    : T extends object
      ? { [K in keyof T]: WidenCopy<T[K]> }
      : T;

export type AppCopy = WidenCopy<typeof zhCopy>;
