import { getModelById, getVideoModelById, getI2IModelById, getI2VModelById, getV2VModelById, getLipSyncModelById } from './models.js';

const BASE_URL = '/api/proxy';

function copyQualityOsParams(payload, params) {
    if (params.provider_mode) payload.provider_mode = params.provider_mode;
    if (params.exact_prompt !== undefined) payload.exact_prompt = params.exact_prompt;
    if (params.disable_fallback !== undefined) payload.disable_fallback = params.disable_fallback;
    if (params.max_quality !== undefined) payload.max_quality = params.max_quality;
    if (params.strict_provider !== undefined) payload.strict_provider = params.strict_provider;
    if (params.run_id) payload.run_id = params.run_id;
    if (params.seed !== undefined && params.seed !== -1) payload.seed = params.seed;
}

async function pollForResult(requestId, key, maxAttempts = 900, interval = 2000) {
    const pollUrl = `${BASE_URL}/api/v1/predictions/${requestId}/result`;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, interval));
        try {
            const response = await fetch(pollUrl, {
                headers: { 'Content-Type': 'application/json', 'x-api-key': key }
            });
            if (!response.ok) {
                const errText = await response.text();
                if (response.status >= 500) continue;
                throw new Error(`Poll Failed: ${response.status} - ${errText.slice(0, 100)}`);
            }
            const data = await response.json();
            const status = data.status?.toLowerCase();
            if (status === 'completed' || status === 'succeeded' || status === 'success') return data;
            if (status === 'failed' || status === 'error') throw new Error(`Generation failed: ${data.error || 'Unknown error'}`);
        } catch (error) {
            if (attempt === maxAttempts) throw error;
        }
    }
    throw new Error('Generation timed out after polling.');
}

async function submitAndPoll(endpoint, payload, key, onRequestId, maxAttempts = 60) {
    const url = `${BASE_URL}/api/v1/${endpoint}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Request Failed: ${response.status} ${response.statusText} - ${errText.slice(0, 100)}`);
    }
    const submitData = await response.json();
    const requestId = submitData.request_id || submitData.id;
    if (!requestId) return submitData;
    if (onRequestId) onRequestId(requestId);
    const result = await pollForResult(requestId, key, maxAttempts);
    const outputUrl = result.outputs?.[0] || result.url || result.output?.url;
    return { ...result, url: outputUrl, audit: submitData.audit };
}

export async function generateImage(apiKey, params) {
    const modelInfo = getModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = { prompt: params.prompt };
    if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.resolution) payload.resolution = params.resolution;
    if (params.quality) payload.quality = params.quality;
    copyQualityOsParams(payload, params);
    if (params.image_url) {
        payload.image_url = params.image_url;
        payload.strength = params.strength || 0.6;
    } else if (params.images_list) {
        payload.images_list = params.images_list;
    } else {
        payload.image_url = null;
    }
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 60);
}

export async function generateI2I(apiKey, params) {
    const modelInfo = getI2IModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = {};
    if (params.prompt) payload.prompt = params.prompt;
    const imageField = modelInfo?.imageField || 'image_url';
    const imagesList = params.images_list?.length > 0 ? params.images_list : (params.image_url ? [params.image_url] : null);
    if (imagesList) {
        if (imageField === 'images_list') payload.images_list = imagesList;
        else payload[imageField] = imagesList[0];
    }
    if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.resolution) payload.resolution = params.resolution;
    if (params.quality) payload.quality = params.quality;
    copyQualityOsParams(payload, params);
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 60);
}

export async function generateVideo(apiKey, params) {
    const modelInfo = getVideoModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = {};
    if (params.prompt) payload.prompt = params.prompt;
    if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.duration) payload.duration = params.duration;
    if (params.resolution) payload.resolution = params.resolution;
    if (params.quality) payload.quality = params.quality;
    if (params.mode) payload.mode = params.mode;
    if (params.image_url) payload.image_url = params.image_url;
    copyQualityOsParams(payload, params);
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900);
}

export async function generateI2V(apiKey, params) {
    const modelInfo = getI2VModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = {};
    if (params.prompt) payload.prompt = params.prompt;
    const imageField = modelInfo?.imageField || 'image_url';
    if (params.image_url) {
        if (imageField === 'images_list') payload.images_list = [params.image_url];
        else payload[imageField] = params.image_url;
    }
    if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.duration) payload.duration = params.duration;
    if (params.resolution) payload.resolution = params.resolution;
    if (params.quality) payload.quality = params.quality;
    if (params.mode) payload.mode = params.mode;
    copyQualityOsParams(payload, params);
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900);
}

export async function generateMarketingStudioAd(apiKey, params) {
    const autoEndpoint = params.resolution === '1080p' ? 'sd-2-vip-omni-reference-1080p' : 'seedance-2-vip-omni-reference';
    const endpoint = params.modelOverride || autoEndpoint;
    const payload = {
        prompt: params.prompt,
        aspect_ratio: params.aspect_ratio || '16:9',
        duration: params.duration || 5,
        images_list: params.images_list || [],
        video_files: params.video_files || []
    };
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900);
}

export async function processLipSync(apiKey, params) {
    const modelInfo = getLipSyncModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = {};
    if (params.audio_url) payload.audio_url = params.audio_url;
    if (params.image_url) payload.image_url = params.image_url;
    if (params.video_url) payload.video_url = params.video_url;
    if (params.prompt) payload.prompt = params.prompt;
    if (params.resolution) payload.resolution = params.resolution;
    if (params.seed !== undefined && params.seed !== -1) payload.seed = params.seed;
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900);
}

export function uploadFile(apiKey, file, onProgress) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');

        if (onProgress) {
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    onProgress(percentComplete);
                }
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    const fileUrl = data.url || data.file_url || data.data?.url;
                    if (!fileUrl) {
                        reject(new Error('No URL returned from file upload'));
                    } else {
                        resolve(fileUrl);
                    }
                } catch (e) {
                    reject(new Error('Failed to parse upload response'));
                }
            } else {
                let detail = xhr.statusText;
                try {
                    const errObj = JSON.parse(xhr.responseText);
                    detail = errObj.detail || detail;
                } catch (e) {
                    // fallback to statusText
                }
                reject(new Error(`File upload failed: ${xhr.status} - ${detail}`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during file upload'));
        xhr.send(formData);
    });
}

const WF = '/api/workflow';

export async function getTemplateWorkflows(apiKey) {
    const r = await fetch(`${WF}/get-template-workflows`, { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey } });
    if (!r.ok) throw new Error(`Failed to fetch template workflows: ${r.status}`);
    return r.json();
}

export async function getUserWorkflows(apiKey) {
    const r = await fetch(`${WF}/get-workflow-defs`, { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey } });
    if (!r.ok) throw new Error(`Failed to fetch user workflows: ${r.status}`);
    return r.json();
}

export async function getPublishedWorkflows(apiKey) {
    const r = await fetch(`${WF}/get-published-workflows`, { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey } });
    if (!r.ok) throw new Error(`Failed to fetch published workflows: ${r.status}`);
    return r.json();
}

export async function createWorkflow(apiKey, payload) {
    const r = await fetch(`${WF}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`Failed to create workflow: ${r.status}`);
    return r.json();
}

export async function updateWorkflowName(apiKey, workflowId, name) {
    const r = await fetch(`${WF}/update-name/${workflowId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ name })
    });
    if (!r.ok) throw new Error(`Failed to rename workflow: ${r.status}`);
    return r.json();
}

export async function deleteWorkflow(apiKey, workflowId) {
    const r = await fetch(`${WF}/delete-workflow-def/${workflowId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }
    });
    if (!r.ok) throw new Error(`Failed to delete workflow: ${r.status}`);
    return r.json();
}

export async function getWorkflowInputs(apiKey, workflowId) {
    const r = await fetch(`${WF}/${workflowId}/api-inputs`, { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey } });
    if (!r.ok) throw new Error(`Failed to fetch workflow inputs: ${r.status}`);
    return r.json();
}

async function pollWorkflowResult(runId, apiKey, maxAttempts = 900, interval = 2000) {
    const url = `${WF}/run/${runId}/api-outputs`;
    for (let i = 1; i <= maxAttempts; i++) {
        await new Promise(res => setTimeout(res, interval));
        try {
            const r = await fetch(url, { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey } });
            if (!r.ok) { if (r.status >= 500) continue; throw new Error(`Poll failed: ${r.status}`); }
            const data = await r.json();
            const status = data.status?.toLowerCase();
            if (status === 'completed' || status === 'succeeded' || status === 'success') return data;
            if (status === 'failed' || status === 'error') throw new Error(`Workflow failed: ${data.error || 'Unknown error'}`);
        } catch (err) { if (i === maxAttempts) throw err; }
    }
    throw new Error('Workflow timed out after polling.');
}

export async function executeWorkflow(apiKey, workflowId, inputs) {
    const r = await fetch(`${WF}/${workflowId}/api-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ inputs })
    });
    if (!r.ok) throw new Error(`Failed to execute workflow: ${r.status}`);
    const submitData = await r.json();
    const runId = submitData.run_id || submitData.id;
    if (!runId) return submitData;
    return pollWorkflowResult(runId, apiKey);
}

export async function getAllNodeSchemas(apiKey, workflowId) {
    const r = await fetch(`${WF}/${workflowId}/node-schemas`, { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey } });
    if (!r.ok) throw new Error(`Failed to fetch node schemas: ${r.status}`);
    return r.json();
}

export async function getWorkflowData(apiKey, workflowId) {
    const r = await fetch(`${WF}/get-workflow-def/${workflowId}`, { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey } });
    if (!r.ok) throw new Error(`Failed to fetch workflow data: ${r.status}`);
    return r.json();
}

export async function getNodeSchemas(apiKey, workflowId) {
    const r = await fetch(`${WF}/${workflowId}/api-node-schemas`, { headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey } });
    if (!r.ok) throw new Error(`Failed to fetch node schemas: ${r.status}`);
    return r.json();
}

export async function runSingleNode(apiKey, workflowId, nodeId, payload) {
    const r = await fetch(`${WF}/${workflowId}/node/${nodeId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`Failed to run node: ${r.status}`);
    return r.json();
}

export async function deleteNodeRun() { return {}; }
