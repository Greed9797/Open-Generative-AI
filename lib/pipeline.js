import { getJob, updateJob, appendLog } from './agent-jobs.js';
import { runOrchestrator } from './agents/orchestrator.js';
import { extractVisionBriefing } from './agents/vision-briefing.js';
import { generateCinematographyPlan } from './agents/cinematography-director.js';
import { resolveApiKey } from './resolve-api-key.js';
import { runSegment } from './segment-runner.js';
import { renderFinal } from './render-final.js';

export async function runPipeline(jobId) {
  try {
    const existing = getJob(jobId);
    if (existing?.status === 'running' || existing?.status === 'pending') {
      const segments = existing.segments.map((segment) => (
        ['passed', 'best_effort'].includes(segment.status)
          ? segment
          : { ...segment, status: 'pending', currentStep: '' }
      ));
      updateJob(jobId, { segments });
      if (existing.status === 'running') {
        appendLog(jobId, 'Orchestrator', 'Resuming running job; pending interrupted segments');
      }
    }

    updateJob(jobId, { status: 'running' });
    appendLog(jobId, 'Orchestrator', 'Job started');

    let job = getJob(jobId);
    if (!job.visionBriefing) {
      const analysisKey = await resolveApiKey({ userId: job.userId || job.user_id, role: 'analysis_agent', fallbackKeys: job.apiKeys }).catch(() => null);
      const visionBriefing = await extractVisionBriefing({ baseImageUrl: job.baseImageUrl, geminiApiKey: analysisKey?.key });
      updateJob(jobId, { visionBriefing });
      appendLog(jobId, 'CinematographyDirector', visionBriefing ? 'Vision briefing extracted' : 'Vision briefing skipped');
    }

    job = getJob(jobId);
    if (!job.cinematographyPlan) {
      const cinematographyPlan = await generateCinematographyPlan({
        visionBriefing: job.visionBriefing,
        style: job.style,
        targetModel: job.targetModel,
        userId: job.userId || job.user_id,
        apiKeys: job.apiKeys,
      });
      updateJob(jobId, { cinematographyPlan });
      appendLog(jobId, 'CinematographyDirector', 'Cinematography plan created');
    }

    job = getJob(jobId);
    if (!job.orchestratorPlan) {
      const plan = await runOrchestrator(job);
      updateJob(jobId, { orchestratorPlan: plan });
      appendLog(jobId, 'Orchestrator', 'Execution plan created');
    }

    for (let index = 0; index < 3; index += 1) {
      job = getJob(jobId);
      if (['passed', 'best_effort'].includes(job.segments[index]?.status)) continue;
      await runSegment(jobId, index);
    }

    job = getJob(jobId);
    const bestEffortCount = job.segments.filter((segment) => segment.status === 'best_effort').length;
    if (bestEffortCount > 1) {
      appendLog(jobId, 'Orchestrator', 'More than one segment needed best effort; replanning and retrying failed segments');
      const replanContext = {
        failedSegments: job.segments
          .filter((segment) => segment.status === 'best_effort')
          .map((segment) => ({
            index: segment.index,
            bestScore: segment.score || 0,
            recurringProblems: (segment.attempts || []).flatMap((attempt) => attempt.problems || []),
            triedPrompts: (segment.attempts || []).map((attempt) => attempt.prompt).filter(Boolean),
          })),
      };
      const refreshedPlan = await runOrchestrator({ ...job, replanContext });
      const resetSegments = job.segments.map((segment) => (
        segment.status === 'best_effort'
          ? { ...segment, status: 'pending', attempts: [], finalClipUrl: null, currentStep: 'Aguardando re-planejamento...' }
          : segment
      ));
      updateJob(jobId, { orchestratorPlan: refreshedPlan, segments: resetSegments });

      for (let index = 0; index < 3; index += 1) {
        job = getJob(jobId);
        if (['passed', 'best_effort'].includes(job.segments[index]?.status)) continue;
        await runSegment(jobId, index);
      }
    }

    await renderFinal(jobId);
  } catch (error) {
    appendLog(jobId, 'Orchestrator', `Pipeline failed: ${error.message}`);
    updateJob(jobId, { status: 'failed' });
  }
}
