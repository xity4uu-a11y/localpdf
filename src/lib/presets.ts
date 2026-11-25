import invoiceHeaderPreset from '../../plugins/invoice-header-preset.json';
import resumeCleanTypography from '../../plugins/resume-clean-typography.json';
import certificateLayoutPreset from '../../plugins/certificate-layout-preset.json';
import signatureStampPack from '../../plugins/signature-stamp-pack.json';
import pdfMergeBatchWorkflow from '../../plugins/pdf-merge-batch-workflow.json';
import type { FontAliasRule, PluginManifest } from './types';

export const BUNDLED_PLUGINS: PluginManifest[] = [
  invoiceHeaderPreset as PluginManifest,
  resumeCleanTypography as PluginManifest,
  certificateLayoutPreset as PluginManifest,
  signatureStampPack as PluginManifest,
  pdfMergeBatchWorkflow as PluginManifest
];

export function collectPluginFontAliases(plugins: PluginManifest[] = BUNDLED_PLUGINS): FontAliasRule[] {
  const aliases: FontAliasRule[] = [];
  for (const plugin of plugins) {
    if (plugin.fontAliases) {
      aliases.push(...plugin.fontAliases);
    }
  }
  return aliases;
}
