import { getJob, updateJob, appendLog } from './agent-jobs.js';
import { refinePrompt } from './agents/prompt-engineer.js';
import { generateClip } from './agents/video-generator.js';
import { checkQuality } from './agents/quality-checker.js';

function updateSegment(jobId, segmentIndex, nextSegment) {
  const job = getJob(jobId);
  const segments = job.segments.map((segment) => (
    segment.index === segmentIndex ? nextSegment : segment
  ));
  updateJob(jobId, { segments });
}

function setCurrentStep(jobId, segmentIndex, currentStep) {
  const job = getJob(jobId);
  const segment = job.segments[segmentIndex];
  updateSegment(jobId, segmentIndex, { ...segment, currentStep });
}

function bestAttempt(attempts) {
  return [...attempts].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
}

export async function runSegment(jobId, segmentIndex) {
  let job = getJob(jobId);
  let segment = job.segments[segmentIndex];
  const segmentSpec = job.orchestratorPlan.segments.find((item) => item.index === segmentIndex) || {};
  segment = { ...segment, status: 'running', currentStep: 'Refining prompt...' };
  updateSegment(jobId, segmentIndex, segment);
  appendLog(jobId, 'PromptEngineer', `Segment ${segment.label} started`);

  for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber += 1) {
    job = getJob(jobId);
    segment = job.segments[segmentIndex];
    const previousAttempt = segment.attempts.at(-1) || null;

    let prompt = previousAttempt?.prompt || segmentSpec.startingPrompt || job.roughPrompt || '';
    let clipUrl = null;
    let quality = null;
    try {
      setCurrentStep(jobId, segmentIndex, 'Refining prompt...');
      prompt = await refinePrompt({
        segmentSpec,
        previousAttempt,
        targetModel: job.targetModel,
        roughPrompt: job.roughPrompt,
        consistencyRules: job.orchestratorPlan.consistencyRules,
        apiKeys: job.apiKeys,
        userId: job.userId,
      });
      appendLog(jobId, 'PromptEngineer', `Segment ${segment.label} attempt ${attemptNumber}: prompt refined`);

      setCurrentStep(jobId, segmentIndex, 'Generating clip...');
      clipUrl = await generateClip({
        prompt,
        baseImageUrl: job.baseImageUrl,
        targetModel: job.targetModel,
        apiKeys: job.apiKeys,
        userId: job.userId,
      });
      appendLog(jobId, 'VideoGen', `Segment ${segment.label} attempt ${attemptNumber}: clip generated`);

      setCurrentStep(jobId, segmentIndex, 'Analyzing frames...');
      quality = await checkQuality({
        clipUrl,
        segmentPrompt: prompt,
        attempt: attemptNumber,
        baseImageUrl: job.baseImageUrl,
        apiKeys: job.apiKeys,
        userId: job.userId,
      });
      appendLog(jobId, 'QualityChecker', `Segment ${segment.label} attempt ${attemptNumber}: score ${quality.score}/10`);
      if (quality.warning) appendLog(jobId, 'QualityChecker', quality.warning);
    } catch (error) {
      appendLog(jobId, 'VideoGen', `Segment ${segment.label} attempt ${attemptNumber} failed: ${error.message}`);
      quality = {
        score: 0,
        passed: false,
        problems: [error.message],
        suggestions: ['Retry with a simpler, more explicit prompt.'],
        breakdown: {
          promptAdherence: 0,
          motionQuality: 0,
          subjectConsistency: 0,
          visualArtifacts: 0,
          cinematicQuality: 0,
        },
      };
    }

    job = getJob(jobId);
    segment = job.segments[segmentIndex];
    const attempt = {
      prompt,
      clipUrl,
      score: quality.score,
      passed: quality.passed,
      problems: quality.problems,
      suggestions: quality.suggestions,
      breakdown: quality.breakdown,
    };
    const attempts = [...segment.attempts, attempt];

    if (quality.passed) {
      segment = { ...segment, attempts, status: 'passed', finalClipUrl: clipUrl, currentStep: '' };
      updateSegment(jobId, segmentIndex, segment);
      appendLog(jobId, 'QualityChecker', `Segment ${segment.label} passed`);
      return;
    }

    if (attemptNumber === 3) {
      const best = bestAttempt(attempts);
      segment = { ...segment, attempts, status: 'best_effort', finalClipUrl: best.clipUrl || job.baseImageUrl, currentStep: '' };
      updateSegment(jobId, segmentIndex, segment);
      appendLog(jobId, 'QualityChecker', `Segment ${segment.label} marked best_effort with score ${best.score}/10`);
      return;
    }

    segment = { ...segment, attempts, status: 'running', currentStep: 'Refining prompt...' };
    updateSegment(jobId, segmentIndex, segment);
  }
}
