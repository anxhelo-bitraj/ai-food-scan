export type Preferences = {
  diet: {
    vegan: boolean;
    vegetarian: boolean;
  };
  allergies: {
    nuts: boolean;
    gluten: boolean;
    dairy: boolean;
    eggs: boolean;
    soy: boolean;
  };
  sensitivity: "Normal" | "Strict";
};

const DEFAULTS: Preferences = {
  diet: { vegan: false, vegetarian: false },
  allergies: { nuts: false, gluten: false, dairy: false, eggs: false, soy: false },
  sensitivity: "Normal",
};

function getPrefStore(): { prefs: Preferences } {
  const g: any = globalThis as any;
  if (!g.__aiFoodScanPrefs) g.__aiFoodScanPrefs = { prefs: DEFAULTS };
  return g.__aiFoodScanPrefs as { prefs: Preferences };
}

export function getPreferences(): Preferences {
  return { ...getPrefStore().prefs };
}

export function setPreferences(next: Preferences) {
  getPrefStore().prefs = next;
}
