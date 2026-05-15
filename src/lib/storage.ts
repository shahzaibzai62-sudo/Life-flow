import { SafeJSON } from "./utils";

export const Storage = {
  get: <T>(key: string, defaultValue: T): T => {
    const item = localStorage.getItem(`lifeflow_${key}`);
    return SafeJSON.parse(item, defaultValue);
  },
  set: <T>(key: string, value: T): void => {
    const stringified = SafeJSON.stringify(value);
    if (stringified) {
      try {
        localStorage.setItem(`lifeflow_${key}`, stringified);
      } catch (e) {
        console.error('Error writing to localStorage', e);
      }
    }
  }
};
