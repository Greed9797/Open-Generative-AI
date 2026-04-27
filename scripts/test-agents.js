// scripts/test-agents.js
// Testa cada agente isoladamente com dados mockados.
// Roda: node scripts/test-agents.js

const { existsSync, readFileSync } = require('node:fs');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const requiredKeys = ['MINIMAX_API_KEY', 'GEMINI_API_KEY'];
const missingKeys = requiredKeys.filter((key) => !process.env[key] || process.env[key] === 'sua_key_aqui');
if (missingKeys.length) {
  throw new Error(`Missing required env keys for smoke test: ${missingKeys.join(', ')}`);
}

(async () => {
  const { runOrchestrator } = await import('../lib/agents/orchestrator.js');
  const { refinePrompt } = await import('../lib/agents/prompt-engineer.js');
  const { checkQuality } = await import('../lib/agents/quality-checker.js');

  console.log('\n=== ORCHESTRATOR ===');
  const mockJob = {
    baseImageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Bikeshot.jpg/1280px-Bikeshot.jpg',
    roughPrompt: 'pessoa andando de bicicleta numa cidade ao entardecer',
    targetModel: 'seedance',
    style: 'Cinematic',
  };
  const plan = await runOrchestrator(mockJob);
  console.log(JSON.stringify(plan, null, 2));

  console.log('\n=== PROMPT ENGINEER (attempt 1) ===');
  const refined = await refinePrompt({
    segmentSpec: plan.segments[0],
    previousAttempt: null,
    targetModel: 'seedance',
  });
  console.log(refined);

  console.log('\n=== PROMPT ENGINEER (retry) ===');
  const refined2 = await refinePrompt({
    segmentSpec: plan.segments[0],
    previousAttempt: {
      prompt: refined,
      score: 4,
      problems: ['subject disappears at 3s', 'motion is choppy'],
      suggestions: ['add more motion description', 'specify camera movement'],
    },
    targetModel: 'seedance',
  });
  console.log(refined2);

  console.log('\n=== QUALITY CHECKER ===');
  const result = await checkQuality({
    clipUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    segmentPrompt: 'rabbit running in a field',
    attempt: 1,
  });
  console.log(JSON.stringify(result, null, 2));
})();
