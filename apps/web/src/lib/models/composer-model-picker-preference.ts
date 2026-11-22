import { createStoredPreference } from "../preferences/stored-preference";

export const COMPOSER_MODEL_PICKER_STORAGE_KEY = "rakazo.composerModelPicker";

/** Defaults to ON so the model picker is visible in the chat box unless explicitly turned off. */
export function normalizeComposerModelPicker(raw: string | null | undefined): boolean {
  return raw?.trim().toLowerCase() !== "off";
}

export const composerModelPickerPreference = createStoredPreference({
  key: COMPOSER_MODEL_PICKER_STORAGE_KEY,
  parse: normalizeComposerModelPicker,
  serialize: (enabled) => (enabled ? "on" : "off"),
});
