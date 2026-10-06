import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const SCRIPTS_DIR = path.dirname(here);
export const TRACE_FILE = path.join(SCRIPTS_DIR, 'trace.mjs');
export const PLUGIN_ROOT = process.env.HIDKIT_PLUGIN_ROOT
  ? path.resolve(process.env.HIDKIT_PLUGIN_ROOT)
  : path.resolve(SCRIPTS_DIR, '..', '..', '..');
const CHEFFY_DIR = path.join(PLUGIN_ROOT, 'skills', 'cheffy');
export const AGENTS_DIR = path.join(PLUGIN_ROOT, 'agents');
export const HARNESS_DIR = path.join(CHEFFY_DIR, 'references', 'harness');
export const PASS_FILE = path.join(CHEFFY_DIR, 'pass.md');
export const UNTRUSTED_FILE = path.join(CHEFFY_DIR, 'untrusted-content.md');
export const SECURITY_TOOLS_FILE = path.join(CHEFFY_DIR, 'security-tools.yaml');
export const GLOSSARY_FILE = path.join(PLUGIN_ROOT, 'GLOSSARY.md');
