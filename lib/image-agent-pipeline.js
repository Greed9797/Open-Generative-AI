import { llmCall } from './agents/llm-call.js';
import { ImageProviderError, generateImageCandidate } from './agents/image-generator.js';
import { checkImageQuality, describeReferenceImages } from './agents/image-quality-checker.js';
import { appendImageAgentLog, getImageAgentJob, updateImageAgentJob } from './image-agent-jobs.js';
import { createServiceClient } from './supabase/service.js';

const MAX_ATTEMPTS = 3;
const PROVIDER_RETRIES = 2;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithProviderBackoff(jobId, args) {
  let lastError;
  for (let retry = 0; retry <= PROVIDER_RETRIES; retry += 1) {
    try {
      return await generateImageCandidate(args);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ImageProviderError && error.retryable;
      if (!retryable || retry === PROVIDER_RETRIES) throw error;
      const delay = Math.round(1200 * (1.5 ** retry));
      appendImageAgentLog(jobId, 'ImageGen', `Provider instável (${error.message}). Retry técnico ${retry + 1}/${PROVIDER_RETRIES} em ${delay}ms`);
      await wait(delay);
    }
  }
  throw lastError;
}

function cleanText(value) {
  return String(value || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function outputPatch(job, index, patch) {
  const outputs = [...(job.outputs || [])];
  outputs[index] = { ...(outputs[index] || {}), ...patch };
  return outputs;
}

async function expandImagePrompt({ job, outputIndex, previousAttempts }) {
  const referenceNote = job.referenceImages?.length
    ? `Use ${job.referenceImages.length} reference image(s). Reference briefing: ${JSON.stringify(job.referenceBriefing || {})}. Preserve identity/style cues only when the user asks for them.`
    : 'No reference images.';
  const previous = previousAttempts.length
    ? previousAttempts.map((item, idx) => `Attempt ${idx + 1}: score ${item.qa?.score ?? '-'}; problems ${(item.qa?.problems || []).join('; ')}; prompt ${item.prompt}`).join('\n')
    : 'No previous attempts.';
  const message = [
    `Workflow: ${job.workflow}`,
    `Target model: ${job.targetModel}`,
    `Output index: ${outputIndex + 1}/${job.targetCount}`,
    `User prompt: ${job.prompt}`,
    referenceNote,
    `Previous attempts:\n${previous}`,
    'Return one final image-generation prompt, 45-90 words, no markdown.',
  ].join('\n');
  try {
    const text = await llmCall({
      role: 'code_agent',
      fallbackRole: 'analysis_agent',
      temperature: 0.25,
      userId: job.userId,
      apiKeys: job.apiKeys,
      systemPrompt: 'You are an image prompt engineer. Improve prompt clarity, visual specificity, composition, lighting, and model compliance. Do not change the user intent.',
      userMessage: message,
    });
    return cleanText(text).slice(0, 1400) || job.prompt;
  } catch {
    return [job.prompt, `Workflow: ${job.workflow}`, 'high quality, coherent anatomy, clean composition, professional lighting'].filter(Boolean).join(', ');
  }
}

async function persistLearning(job, output, attemptRecord) {
  if (!job.userId || !attemptRecord?.qa || attemptRecord.qa.score < 8) return;
  try {
    const supabase = createServiceClient();
    await supabase.from('image_prompt_learnings').insert({
      user_id: job.userId,
      target_model: job.targetModel,
      workflow: job.workflow,
      prompt_text: attemptRecord.prompt,
      score: attemptRecord.qa.score,
      problems: attemptRecord.qa.problems || [],
      output_url: output.imageUrl,
      metadata: { jobId: job.id, outputIndex: output.index, breakdown: attemptRecord.qa.breakdown || {} },
    });
  } catch {
    /* learning persistence must not block generation */
  }
}

export async function runImageAgentPipeline(jobId) {
  let job = getImageAgentJob(jobId);
  if (!job) return;
  updateImageAgentJob(jobId, { status: 'running' });
    appendImageAgentLog(jobId, 'ImageOrchestrator', `Iniciando ${job.targetCount} imagem(ns) com workflow ${job.workflow}`);
    if (job.referenceImages?.length && !job.referenceBriefing) {
      appendImageAgentLog(jobId, 'GeminiVisionQA', 'Analisando imagens de referência');
      const referenceBriefing = await describeReferenceImages({
        referenceImages: job.referenceImages,
        prompt: job.prompt,
        workflow: job.workflow,
        userId: job.userId,
        apiKeys: job.apiKeys,
      });
      updateImageAgentJob(jobId, { referenceBriefing });
      job = getImageAgentJob(jobId);
    }

  try {
    for (let index = 0; index < job.targetCount; index += 1) {
      job = getImageAgentJob(jobId);
      const existing = job.outputs?.[index];
      if (existing?.status === 'accepted') continue;
      let output = existing || { index, status: 'running', attempts: [] };
      updateImageAgentJob(jobId, { outputs: outputPatch(job, index, output) });

      for (let attempt = output.attempts.length + 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        job = getImageAgentJob(jobId);
        output = job.outputs?.[index] || output;
        appendImageAgentLog(jobId, 'PromptEngineer', `Imagem ${index + 1}: preparando prompt da tentativa ${attempt}`);
        const generatedPrompt = await expandImagePrompt({ job, outputIndex: index, previousAttempts: output.attempts || [] });

        appendImageAgentLog(jobId, 'ImageGen', `Imagem ${index + 1}: gerando tentativa ${attempt}`);
        let generated;
        try {
          generated = await generateWithProviderBackoff(jobId, {
            prompt: generatedPrompt,
            referenceImages: job.referenceImages || [],
            targetModel: job.targetModel,
            aspectRatio: job.aspectRatio,
            seed: job.seed ? Number(job.seed) + index + attempt : undefined,
            userId: job.userId,
          });
        } catch (error) {
          if (error instanceof ImageProviderError) {
            output = {
              ...output,
              status: 'provider_error',
              providerError: {
                message: error.message,
                retryable: error.retryable,
                provider: error.provider,
                model: error.model,
                attempt,
                createdAt: new Date().toISOString(),
              },
            };
            updateImageAgentJob(jobId, { outputs: outputPatch(job, index, output) });
            appendImageAgentLog(jobId, 'ImageGen', `Imagem ${index + 1}: erro técnico do provider, sem consumir tentativa de QA: ${error.message}`);
          }
          throw error;
        }

        appendImageAgentLog(jobId, 'GeminiVisionQA', `Imagem ${index + 1}: avaliando qualidade`);
        const qa = await checkImageQuality({
          imageUrl: generated.imageUrl,
          prompt: generatedPrompt,
          workflow: job.workflow,
          referenceImages: job.referenceImages || [],
          attempt,
          userId: job.userId,
          apiKeys: job.apiKeys,
        });

        const attemptRecord = { attempt, prompt: generatedPrompt, imageUrl: generated.imageUrl, qa, audit: generated.audit, provider: generated.provider, providerModel: generated.providerModel };
        const attempts = [...(output.attempts || []), attemptRecord];
        const best = attempts.reduce((acc, item) => ((item.qa?.score || 0) > (acc.qa?.score || 0) ? item : acc), attempts[0]);
        const accepted = qa.score >= (job.qualityThreshold || 7);
        output = {
          ...output,
          attempts,
          status: accepted ? 'accepted' : attempt === MAX_ATTEMPTS ? 'best_effort' : 'running',
          imageUrl: accepted ? generated.imageUrl : best.imageUrl,
          score: accepted ? qa.score : best.qa?.score || qa.score,
          finalPrompt: accepted ? generatedPrompt : best.prompt,
          problems: qa.problems || [],
        };
        updateImageAgentJob(jobId, { outputs: outputPatch(job, index, output) });

        if (accepted) {
          appendImageAgentLog(jobId, 'GeminiVisionQA', `Imagem ${index + 1}: aprovada com score ${qa.score.toFixed(1)}`);
          await persistLearning(job, output, attemptRecord);
          break;
        }
        appendImageAgentLog(jobId, 'GeminiVisionQA', `Imagem ${index + 1}: score ${qa.score.toFixed(1)}, refinando`);
      }
    }

    job = getImageAgentJob(jobId);
    const accepted = (job.outputs || []).filter((output) => output.status === 'accepted').length;
    const scores = (job.outputs || []).map((output) => Number(output.score || 0)).filter(Boolean);
    const avgScore = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    updateImageAgentJob(jobId, {
      status: 'done',
      qaSummary: { accepted, total: job.targetCount, avgScore },
    });
    appendImageAgentLog(jobId, 'Sistema', `Job concluído: ${accepted}/${job.targetCount} aprovadas, média ${avgScore.toFixed(1)}`);
  } catch (error) {
    appendImageAgentLog(jobId, 'Sistema', `Falha no pipeline de imagem: ${error.message}`);
    updateImageAgentJob(jobId, { status: 'failed' });
  }
}
