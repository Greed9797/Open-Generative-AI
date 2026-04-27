import * as kling from './kling.js';
import * as minimax from './minimax.js';
import * as wan from './wan.js';
import * as runway from './runway.js';
import * as gemini from './gemini.js';
import * as seedance from './seedance.js';

export const adapters = { kling, minimax, wan, runway, gemini, seedance };

export const PROVIDER_DB_NAME = {
  kling: 'Kling',
  minimax: 'MiniMax',
  wan: 'Wan',
  runway: 'Runway',
  gemini: 'Gemini',
  seedance: 'Seedance',
};

export function detectProvider(modelId) {
  if (!modelId) return null;
  const m = modelId.toLowerCase();
  if (m.startsWith('kling')) return 'kling';
  if (m.startsWith('minimax')) return 'minimax';
  if (m.startsWith('wan')) return 'wan';
  if (m.startsWith('runway')) return 'runway';
  if (m.startsWith('veo') || m.startsWith('google-imagen') || m === 'nano-banana') return 'gemini';
  if (m.startsWith('seedance')) return 'seedance';
  return null;
}

export function getAdapter(providerName) {
  return adapters[providerName] || null;
}

export function parsePollId(encodedId) {
  const colonIdx = encodedId.indexOf(':');
  if (colonIdx === -1) return { provider: null, taskId: encodedId };

  const prefix = encodedId.slice(0, colonIdx);
  const taskId = encodedId.slice(colonIdx + 1);

  if (prefix.startsWith('kling')) return { provider: 'kling', taskId: encodedId };
  if (prefix === 'minimax') return { provider: 'minimax', taskId };
  if (prefix === 'wan') return { provider: 'wan', taskId };
  if (prefix === 'runway') return { provider: 'runway', taskId };
  if (prefix === 'gemini') return { provider: 'gemini', taskId };
  if (prefix === 'gemini_image') return { provider: 'gemini', taskId: `image:${taskId}` };
  if (prefix === 'seedance') return { provider: 'seedance', taskId };
  return { provider: null, taskId: encodedId };
}
