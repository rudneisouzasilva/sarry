export declare const secureStorage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
export declare function getPref(key: string): Promise<string | null>;
export declare function setPref(key: string, value: string | null): Promise<void>;
