export interface PluginValidationResult {
  file: string;
  ok: boolean;
  errors: string[];
}

export function validateAllPlugins(): PluginValidationResult[];
