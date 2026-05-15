import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safe JSON parsing with fallback
 */
export const SafeJSON = {
  parse: <T>(json: string | null, fallback: T): T => {
    if (!json) return fallback;
    try {
      return JSON.parse(json) as T;
    } catch (error) {
      console.error("JSON Parse Error:", error);
      return fallback;
    }
  },
  stringify: (value: any): string => {
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.error("JSON Stringify Error:", error);
      return "";
    }
  }
};

/**
 * Basic input validation
 */
export const Validator = {
  isValidString: (val: any, min = 1, max = 255): boolean => {
    return typeof val === 'string' && val.trim().length >= min && val.trim().length <= max;
  },
  isValidId: (val: any): boolean => {
    return typeof val === 'string' && val.length > 0;
  }
};
