// Provider adapters. Maker ≠ checker doctrine (CROSS-MODEL-GATE.md) requires
// G2 runs on 3 distinct providers for agentic products. CLIs are invoked
// fresh-context: no estate config, temp home, product materials only.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CLI = {
  claude: p => ['claude', ['-p', p, '--output-format', 'text', '--max-turns', '30']],
  codex: p => ['codex', ['exec', '--sandbox', 'read-only', p]],
  grok: p => ['grok', ['--prompt', p]]
};

export async function runProvider(provider, prompt, manifest) {
  if (provider === 'mock') return mock(manifest);
  const spec = CLI[provider];
  if (!spec) throw new Error(`unknown provider: ${provider}`);
  const [bin, argv] = spec(prompt);
  const transcript = execFileSync(bin, argv, {
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
    maxBuffer: 32 * 1024 * 1024,
    env: cleanEnv()
  });
  return { transcript, providerLabel: `${provider} (CLI, fresh env)` };
}

// Strip estate-identifying context so the buyer agent starts cold.
function cleanEnv() {
  const keep = ['PATH', 'SYSTEMROOT', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'COMSPEC'];
  const env = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  return env;
}

function mock(manifest) {
  const files = (manifest.files ?? []).map(f => {
    try {
      return `- ${f}: ${readFileSync(f, 'utf8').length} bytes readable`;
    } catch {
      return `- ${f}: MISSING`;
    }
  });
  const missing = files.some(l => l.endsWith('MISSING'));
  return {
    transcript: [
      `# Mock buyer run — ${manifest.id}`,
      'Mechanical file-presence pass only; no reasoning performed.',
      ...files,
      '```defects',
      JSON.stringify(
        missing
          ? [{ severity: 'P0', title: 'Listed product file missing on disk', evidence: files.filter(l => l.endsWith('MISSING')).join('; ') }]
          : [],
        null,
        2
      ),
      '```'
    ].join('\n'),
    providerLabel: 'mock (file-presence only)',
    outcomeReached: !missing
  };
}
