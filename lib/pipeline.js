import { getJob, updateJob, appendLog } from './agent-jobs.js';
import { runOrchestrator } from './agents/orchestrator.js';
import { runSegment } from './segment-runner.js';
import { renderFinal } from './render-final.js';

export async function runPipeline(jobId) {
  try {
    const existing = getJob(jobId);
    if (existing?.status === 'running') {
      const segments = existing.segments.map((segment) => (
        ['passed', 'best_effort'].includes(segment.status)
          ? segment
          : { ...segment, status: 'pending', currentStep: '' }
      ));
      updateJob(jobId, { segments });
      appendLog(jobId, 'Orchestrator', 'Resuming running job; pending interrupted segments');
    }

    updateJob(jobId, { status: 'running' });
    appendLog(jobId, 'Orchestrator', 'Job started');

    let job = getJob(jobId);
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
      const refreshedPlan = await runOrchestrator(job);
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
