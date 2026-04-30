import { getJob, updateJob, appendLog } from './agent-jobs.js';
import { refinePrompt } from './agents/prompt-engineer.js';
import { generateClip } from './agents/video-generator.js';
import { checkPromptViability, checkQuality } from './agents/quality-checker.js';
import { preprocessImage } from './image-preprocessor.js';
import { postProcessVideo } from './video-postprocessor.js';

function updateSegment(jobId, segmentIndex, nextSegment) {
  const job = getJob(jobId);
  const segments = [...(job.segments || [])];
  segments[segmentIndex] = nextSegment;
  updateJob(jobId, { segments });
}

function setCurrentStep(jobId, segmentIndex, currentStep) {
  const job = getJob(jobId);
  const segment = job.segments?.[segmentIndex] || {};
  updateSegment(jobId, segmentIndex, { ...segment, currentStep });
}

function bestAttempt(attempts) {
  return [...attempts].sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
}

function patchResultArray(job, field, segmentIndex, value) {
  const current = Array.isArray(job[field]) ? [...job[field]] : [];
  current[segmentIndex] = value;
  updateJob(job.id, { [field]: current });
}

export async function runSegment(jobId, segmentIndex) {
  let job = getJob(jobId);
  const segmentSpec = job.orchestratorPlan?.segments?.[segmentIndex] || {};
  const existing = job.segments?.[segmentIndex] || { index: segmentIndex, attempts: [] };
  let segment = { ...existing, status: 'running', currentStep: 'Preparando imagem...', attempts: existing.attempts || [] };
  updateSegment(jobId, segmentIndex, segment);

  let baseImageUrl = job.baseImageUrl;
  if (baseImageUrl) {
    try {
      appendLog(jobId, 'PreProcessor', `Preparando imagem do segmento ${segmentIndex + 1}`);
      const preprocessing = await preprocessImage({
        imageUrl: baseImageUrl,
        targetModel: job.targetModel,
        userId: job.userId || job.user_id,
        jobId,
        segmentIndex,
      });
      baseImageUrl = preprocessing.processedUrl || baseImageUrl;
      patchResultArray(getJob(jobId), 'preprocessingResults', segmentIndex, preprocessing);
    } catch (err) {
      appendLog(jobId, 'PreProcessor', `Preprocessamento ignorado: ${err.message}`);
    }
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    job = getJob(jobId);
    segment = job.segments?.[segmentIndex] || segment;
    setCurrentStep(jobId, segmentIndex, 'Validando viabilidade...');

    const roughPrompt = segmentSpec.startingPrompt || job.roughPrompt || '';
    const viability = await checkPromptViability({ prompt: roughPrompt, targetModel: job.targetModel, userId: job.userId || job.user_id, apiKeys: job.apiKeys });
    const viablePrompt = viability.riskLevel === 'high' ? viability.simplifiedPrompt : roughPrompt;
    if (viability.riskLevel === 'high') appendLog(jobId, 'PromptEngineer', 'Prompt simplificado por risco alto');

    setCurrentStep(jobId, segmentIndex, 'Gerando prompt...');
    const prompt = await refinePrompt({
      segmentSpec,
      previousAttempt: segment.attempts?.[segment.attempts.length - 1],
      allAttempts: segment.attempts || [],
      targetModel: job.targetModel,
      roughPrompt: viablePrompt,
      consistencyRules: job.orchestratorPlan?.consistencyRules,
      baseImageUrl,
      visionBriefing: job.visionBriefing,
      cinematographyPlan: job.cinematographyPlan,
      apiKeys: job.apiKeys,
      userId: job.userId || job.user_id,
    });

    let clipUrl = null;
    let quality;
    try {
      setCurrentStep(jobId, segmentIndex, 'Gerando vídeo...');
      clipUrl = await generateClip({ prompt, baseImageUrl, targetModel: job.targetModel, apiKeys: job.apiKeys, userId: job.userId || job.user_id });

      setCurrentStep(jobId, segmentIndex, 'Analisando frames...');
      quality = await checkQuality({ clipUrl, segmentPrompt: prompt, attempt, baseImageUrl, segmentIndex, apiKeys: job.apiKeys, userId: job.userId || job.user_id });
    } catch (err) {
      quality = {
        score: 0,
        passed: false,
        problems: [err.message],
        suggestions: ['Retry with a simpler, more explicit prompt.'],
        breakdown: {},
      };
    }

    const attemptRecord = { attempt, prompt, clipUrl, ...quality };
    const attempts = [...(segment.attempts || []), attemptRecord];
    segment = { ...segment, attempts };

    if (quality.passed) {
      let finalClipUrl = clipUrl;
      try {
        setCurrentStep(jobId, segmentIndex, 'Melhorando qualidade...');
        const post = await postProcessVideo({ clipUrl, jobId, segmentIndex });
        patchResultArray(getJob(jobId), 'postprocessingResults', segmentIndex, post);
        if (!post.skipped && post.outputUrl) finalClipUrl = post.outputUrl;
      } catch (err) {
        appendLog(jobId, 'PostProcessor', `Pós-processamento ignorado: ${err.message}`);
      }
      updateSegment(jobId, segmentIndex, { ...segment, status: 'passed', currentStep: 'Aprovado', finalClipUrl, score: quality.score });
      return;
    }

    if (attempt === 3) {
      const best = bestAttempt(attempts);
      updateSegment(jobId, segmentIndex, {
        ...segment,
        status: 'best_effort',
        currentStep: 'Best effort',
        finalClipUrl: best?.clipUrl || clipUrl || baseImageUrl,
        score: best?.score || 0,
      });
      return;
    }

    updateSegment(jobId, segmentIndex, { ...segment, status: 'running', currentStep: 'Gerando prompt...' });
  }
}
