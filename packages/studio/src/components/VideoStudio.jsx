"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { generateVideo, generateI2V, uploadFile } from "../muapi.js";
import {
  t2vModels,
  i2vModels,
  v2vModels,
  getAspectRatiosForVideoModel,
  getDurationsForModel,
  getResolutionsForVideoModel,
  getAspectRatiosForI2VModel,
  getDurationsForI2VModel,
  getResolutionsForI2VModel,
  getModesForModel,
} from "../models.js";

// ── tiny helpers ──────────────────────────────────────────────────────────────

function getQualitiesForModel(modelList, modelId) {
  const model = modelList.find((m) => m.id === modelId);
  return model?.inputs?.quality?.enum || [];
}

const MAX_QUALITY_MODELS = {
  t2v: "veo3.1-text-to-video",
  i2v: "veo3.1-image-to-video",
};
const GEMINI_PARITY_SEED = 424242;

async function downloadFile(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
}

// ── SVG icons (kept inline to avoid extra deps) ───────────────────────────────

const CheckSvg = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#FF4500"
    strokeWidth="4"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const VideoIconSvg = ({ className }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={className}
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const VideoReadySvg = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="text-primary"
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    <polyline points="7 10 10 13 15 8" stroke="#FF4500" strokeWidth="2.5" />
  </svg>
);

function GenerationDiagnostics({ audit }) {
  if (!audit) return null;
  const enhancement = audit.promptEnhancement;
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-white/5 bg-white/[0.025] p-2">
      <span className="text-[9px] text-white/35">Provider</span>
      <span className="truncate text-right text-[9px] font-bold text-white/55">{audit.effectiveProvider || "n/a"}</span>
      <span className="text-[9px] text-white/35">Modelo real</span>
      <span className="truncate text-right text-[9px] font-bold text-white/55">{audit.providerModel || audit.submittedModel || "n/a"}</span>
      <span className="text-[9px] text-white/35">Fallback</span>
      <span className="text-right text-[9px] font-bold text-white/55">{audit.fallbackUsed ? "usado" : "bloqueado/nao usado"}</span>
      <span className="text-[9px] text-white/35">Enhancer</span>
      <span className="truncate text-right text-[9px] font-bold text-white/55">
        {enhancement?.enhanced ? enhancement.provider || "ativo" : enhancement?.reason || "off"}
      </span>
      {audit.seed && (
        <>
          <span className="text-[9px] text-white/35">Seed</span>
          <span className="text-right text-[9px] font-bold text-white/55">{audit.seed}</span>
        </>
      )}
    </div>
  );
}

// ── Dropdown components ───────────────────────────────────────────────────────

function DropdownItem({ label, selected, onClick }) {
  return (
    <div
      className="flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group"
      onClick={onClick}
    >
      <span className="text-xs font-bold text-white opacity-80 group-hover:opacity-100 capitalize">
        {label}
      </span>
      {selected && <CheckSvg />}
    </div>
  );
}

function ModelDropdown({ imageMode, selectedModel, onSelect, onClose }) {
  const [search, setSearch] = useState("");

  const generationModels = imageMode ? i2vModels : allT2vModels;

  const lf = search.toLowerCase();
  const filteredMain = generationModels.filter(
    (m) => m.name.toLowerCase().includes(lf) || m.id.toLowerCase().includes(lf),
  );
  const filteredV2V = v2vModels.filter(
    (m) => m.name.toLowerCase().includes(lf) || m.id.toLowerCase().includes(lf),
  );

  const getIconColor = (m, isV2V) => {
    if (isV2V) return "bg-orange-500/10 text-orange-400";
    if (m.id.includes("kling")) return "bg-blue-500/10 text-blue-400";
    if (m.id.includes("veo")) return "bg-purple-500/10 text-purple-400";
    if (m.id.includes("sora")) return "bg-rose-500/10 text-rose-400";
    return "bg-primary/10 text-primary";
  };

  const renderItem = (m, isV2V = false) => (
    <div
      key={m.id}
      className={`flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-white/5 ${selectedModel === m.id ? "bg-white/5 border-white/5" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(m, isV2V);
        onClose();
      }}
    >
      <div className="flex items-center gap-3.5">
        <div
          className={`w-10 h-10 ${getIconColor(m, isV2V)} border border-white/5 rounded-xl flex items-center justify-center font-black text-sm shadow-inner uppercase`}
        >
          {m.name.charAt(0)}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-white tracking-tight">
            {m.name}
          </span>
          {isV2V && (
            <span className="text-[9px] text-orange-400/70">
              Faça upload de um vídeo para usar
            </span>
          )}
        </div>
      </div>
      {selectedModel === m.id && <CheckSvg />}
    </div>
  );

  return (
    <div className="flex flex-col h-full max-h-[70vh]">
      <div className="px-2 pb-3 mb-2 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5 border border-white/5 focus-within:border-primary/50 transition-colors">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Buscar modelos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="bg-transparent border-none text-xs text-white focus:ring-0 w-full p-0 outline-none"
          />
        </div>
      </div>
      <div className="text-xs font-bold text-secondary px-3 py-2 shrink-0">
        Modelos de vídeo
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2">
        {filteredMain.map((m) => renderItem(m, false))}
        {filteredV2V.length > 0 && (
          <>
            <div className="text-xs font-bold text-orange-400/70 px-3 py-2 mt-1 border-t border-white/5">
              Ferramentas de vídeo
            </div>
            {filteredV2V.map((m) => renderItem(m, true))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Control button ────────────────────────────────────────────────────────────

function ControlBtn({ icon, label, onClick, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className="flex items-center gap-1.5 md:gap-2.5 px-3 md:px-4 py-2 md:py-2.5 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all border border-white/5 group whitespace-nowrap"
    >
      {icon}
      <span className="text-xs font-bold text-white group-hover:text-primary transition-colors">
        {label}
      </span>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-20 group-hover:opacity-100 transition-opacity"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

// ── Dropdown panel ─────────────────────────────────────────────────────────────
// Rendered inside a `relative` wrapper div; floats above the anchor button.

// ── Main component ────────────────────────────────────────────────────────────

export default function VideoStudio({
  apiKey,
  onGenerationComplete,
  historyItems,
  droppedFiles,
  onFilesHandled,
}) {
  const PERSIST_KEY = "hg_video_studio_persistent";

  // ── mode state ──
  const [imageMode, setImageMode] = useState(false); // i2v
  const [v2vMode, setV2vMode] = useState(false);
  const [maxQualityMode, setMaxQualityMode] = useState(false);

  // ── custom models ──
  const [customT2vModels, setCustomT2vModels] = useState([]);
  useEffect(() => {
    let headers = {};
    try {
      const stored = localStorage.getItem('creativeos_supabase_session');
      const token = stored ? JSON.parse(stored)?.accessToken : null;
      if (token) headers = { Authorization: `Bearer ${token}` };
    } catch { /* ignore */ }
    fetch('/api/settings/api-keys', { headers })
      .then((r) => r.ok ? r.json() : { keys: [] })
      .then(({ keys = [] }) => {
        const custom = keys
          .filter((k) => k.isCustom && k.isActive && k.roles?.includes('video_gen') && k.modelIdentifier)
          .map((k) => ({ id: k.modelIdentifier, name: k.providerName, endpoint: k.modelIdentifier, inputs: { prompt: { type: 'string' } } }));
        setCustomT2vModels(custom);
      })
      .catch(() => {});
  }, []);
  const allT2vModels = useMemo(() => [...customT2vModels, ...t2vModels], [customT2vModels]);

  // ── model / params ──
  const defaultModel = t2vModels[0];
  const [selectedModel, setSelectedModel] = useState(defaultModel.id);
  const [selectedModelName, setSelectedModelName] = useState(defaultModel.name);
  const [selectedAr, setSelectedAr] = useState(
    defaultModel.inputs?.aspect_ratio?.default || "16:9",
  );
  const [selectedDuration, setSelectedDuration] = useState(
    defaultModel.inputs?.duration?.default || 5,
  );
  const [selectedResolution, setSelectedResolution] = useState(
    defaultModel.inputs?.resolution?.default || "",
  );
  const [selectedQuality, setSelectedQuality] = useState(
    defaultModel.inputs?.quality?.default || "",
  );
  const [selectedMode, setSelectedMode] = useState("");

  // ── upload progress ──
  const [imageProgress, setImageProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);

  // ── control visibility ──
  const [showAr, setShowAr] = useState(true);
  const [showDuration, setShowDuration] = useState(true);
  const [showResolution, setShowResolution] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [showMode, setShowMode] = useState(false);

  // ── uploads ──
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [uploadedVideoName, setUploadedVideoName] = useState(null);

  // ── generation / canvas ──
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [fullscreenUrl, setFullscreenUrl] = useState(null);
  const [canvasUrl, setCanvasUrl] = useState(null);
  const [canvasModel, setCanvasModel] = useState(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const [lastGenerationId, setLastGenerationId] = useState(null);
  const [lastGenerationModel, setLastGenerationModel] = useState(null);

  // ── history ──
  const [localHistory, setLocalHistory] = useState([]);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);

  // ── dropdown ──
  const [openDropdown, setOpenDropdown] = useState(null); // 'model'|'ar'|'duration'|'resolution'|'quality'|'mode'|null

  // ── sidebar ──
  const [sidebarTab, setSidebarTab] = useState("Criar Vídeo");
  const [uploadedImagePreview, setUploadedImagePreview] = useState(null);

  // ── prompt ──
  const [prompt, setPrompt] = useState("");
  const [promptDisabled, setPromptDisabled] = useState(false);

  // ── refs ──
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const imageFileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);
  const resultVideoRef = useRef(null);
  const hasRestored = useRef(false);

  // ── derived data ──
  const history = historyItems ?? localHistory;

  const getCurrentModels = useCallback(() => {
    if (v2vMode) return v2vModels;
    return imageMode ? i2vModels : allT2vModels;
  }, [imageMode, v2vMode, allT2vModels]);

  const getCurrentAspectRatios = useCallback(
    (id) =>
      imageMode
        ? getAspectRatiosForI2VModel(id)
        : getAspectRatiosForVideoModel(id),
    [imageMode],
  );

  const getCurrentDurations = useCallback(
    (id) =>
      imageMode ? getDurationsForI2VModel(id) : getDurationsForModel(id),
    [imageMode],
  );

  const getCurrentResolutions = useCallback(
    (id) =>
      imageMode
        ? getResolutionsForI2VModel(id)
        : getResolutionsForVideoModel(id),
    [imageMode],
  );

  const getCurrentModel = useCallback(
    () => getCurrentModels().find((m) => m.id === selectedModel),
    [getCurrentModels, selectedModel],
  );

  // ── update controls when model/mode changes ──────────────────────────────
  const applyControlsForModel = useCallback(
    (modelId, isImageMode, isV2vMode) => {
      if (isV2vMode) {
        setShowAr(false);
        setShowDuration(false);
        setShowResolution(false);
        setShowQuality(false);
        setShowMode(false);
        return;
      }

      const modelList = isImageMode ? i2vModels : allT2vModels;
      const model = modelList.find((m) => m.id === modelId);

      const ars = isImageMode
        ? getAspectRatiosForI2VModel(modelId)
        : getAspectRatiosForVideoModel(modelId);
      if (ars.length > 0) {
        setSelectedAr(ars[0]);
        setShowAr(true);
      } else {
        setShowAr(false);
      }

      const durations = isImageMode
        ? getDurationsForI2VModel(modelId)
        : getDurationsForModel(modelId);
      if (durations.length > 0) {
        setSelectedDuration(durations[0]);
        setShowDuration(true);
      } else {
        setShowDuration(false);
      }

      const resolutions = isImageMode
        ? getResolutionsForI2VModel(modelId)
        : getResolutionsForVideoModel(modelId);
      if (resolutions.length > 0) {
        setSelectedResolution(resolutions[0]);
        setShowResolution(true);
      } else {
        setShowResolution(false);
      }

      const qualities = getQualitiesForModel(modelList, modelId);
      if (qualities.length > 0) {
        setSelectedQuality(model?.inputs?.quality?.default || qualities[0]);
        setShowQuality(true);
      } else {
        setSelectedQuality("");
        setShowQuality(false);
      }

      const modes = getModesForModel(modelId);
      if (modes.length > 0) {
        setSelectedMode(model?.inputs?.mode?.default || modes[0]);
        setShowMode(true);
      } else {
        setSelectedMode("");
        setShowMode(false);
      }
    },
    [],
  );

  // ── Persistence: Load ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.imageMode !== undefined) setImageMode(data.imageMode);
        if (data.v2vMode !== undefined) setV2vMode(data.v2vMode);
        if (data.maxQualityMode !== undefined) setMaxQualityMode(data.maxQualityMode);
        if (data.selectedModel) setSelectedModel(data.selectedModel);
        if (data.selectedModelName) setSelectedModelName(data.selectedModelName);
        if (data.selectedAr) setSelectedAr(data.selectedAr);
        if (data.selectedDuration) setSelectedDuration(data.selectedDuration);
        if (data.selectedResolution) setSelectedResolution(data.selectedResolution);
        if (data.selectedQuality) setSelectedQuality(data.selectedQuality);
        if (data.selectedMode) setSelectedMode(data.selectedMode);
        if (data.uploadedImageUrl) setUploadedImageUrl(data.uploadedImageUrl);
        if (data.uploadedVideoUrl) setUploadedVideoUrl(data.uploadedVideoUrl);
        if (data.uploadedVideoName) setUploadedVideoName(data.uploadedVideoName);
        if (data.prompt) setPrompt(data.prompt);
        if (data.localHistory) setLocalHistory(data.localHistory);

        // Update control visibility based on restored model/mode
        applyControlsForModel(
          data.selectedModel || defaultModel.id,
          !!data.imageMode,
          !!data.v2vMode
        );
      }
    } catch (err) {
      console.warn("Failed to load VideoStudio persistence:", err);
    } finally {
      hasRestored.current = true;
    }
  }, [applyControlsForModel, defaultModel.id]);

  // ── Adjust height on load ────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        const el = textareaRef.current;
        el.style.height = "auto";
        const maxH = window.innerWidth < 768 ? 150 : 250;
        el.style.height = Math.min(el.scrollHeight, maxH) + "px";
      }
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // ── Persistence: Save ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state = {
          imageMode,
          v2vMode,
          maxQualityMode,
          selectedModel,
          selectedModelName,
          selectedAr,
          selectedDuration,
          selectedResolution,
          selectedQuality,
          selectedMode,
          uploadedImageUrl,
          uploadedVideoUrl,
          uploadedVideoName,
          prompt,
          localHistory,
        };
        localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to save VideoStudio persistence:", err);
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [
    imageMode,
    v2vMode,
    maxQualityMode,
    selectedModel,
    selectedModelName,
    selectedAr,
    selectedDuration,
    selectedResolution,
    selectedQuality,
    selectedMode,
    uploadedImageUrl,
    uploadedVideoUrl,
    uploadedVideoName,
    prompt,
    localHistory,
  ]);

  // ── Derived UI values ────────────────────────────────────────────────────

  const processDroppedImage = async (file) => {
    if (file.size > 10 * 1024 * 1024) {
      alert("Imagem excede o limite de 10MB.");
      return;
    }
    setImageUploading(true);
    setImageProgress(0);
    try {
      const url = await uploadFile(apiKey, file, (pct) => {
        setImageProgress(pct);
      });
      setUploadedImageUrl(url);
      setUploadedVideoUrl(null);
      setUploadedVideoName(null);
      setV2vMode(false);
      if (!imageMode) {
        const firstI2V = maxQualityMode
          ? i2vModels.find((m) => m.id === MAX_QUALITY_MODELS.i2v) || i2vModels[0]
          : i2vModels[0];
        setImageMode(true);
        setSelectedModel(firstI2V.id);
        setSelectedModelName(firstI2V.name);
        applyControlsForModel(firstI2V.id, true, false);
      }
      setPromptDisabled(false);
    } catch (err) {
      alert(`Image upload failed: ${err.message}`);
    } finally {
      setImageUploading(false);
      setImageProgress(0);
    }
  };

  const processDroppedVideo = async (file) => {
    if (file.size > 50 * 1024 * 1024) {
      alert("Vídeo excede o limite de 50MB.");
      return;
    }
    setVideoUploading(true);
    setVideoProgress(0);
    try {
      const url = await uploadFile(apiKey, file, (pct) => {
        setVideoProgress(pct);
      });
      setUploadedVideoUrl(url);
      setUploadedVideoName(file.name);
      if (imageMode) {
        setUploadedImageUrl(null);
        setImageMode(false);
      }
      setV2vMode(true);
      setMaxQualityMode(false);
      const firstV2V = v2vModels[0];
      setSelectedModel(firstV2V.id);
      setSelectedModelName(firstV2V.name);
      applyControlsForModel(firstV2V.id, false, true);
      setPrompt("");
      setPromptDisabled(true);
    } catch (err) {
      alert(`Video upload failed: ${err.message}`);
    } finally {
      setVideoUploading(false);
      setVideoProgress(0);
    }
  };

  // ── Handle Dropped Files ────────────────────────────────────────────────
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      const imageFiles = droppedFiles.filter(f => f.type.startsWith('image/'));
      const videoFiles = droppedFiles.filter(f => f.type.startsWith('video/'));
      
      if (videoFiles.length > 0) {
        processDroppedVideo(videoFiles[0]);
      } else if (imageFiles.length > 0) {
        processDroppedImage(imageFiles[0]);
      }
      onFilesHandled?.();
    }
  }, [droppedFiles, onFilesHandled, processDroppedImage, processDroppedVideo]);

  // Initialise controls for default model on mount
  useEffect(() => {
    if (hasRestored.current) return;
    applyControlsForModel(defaultModel.id, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [openDropdown]);

  // ── textarea auto-resize ──────────────────────────────────────────────────
  const handlePromptInput = (e) => {
    setPrompt(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    const maxH = window.innerWidth < 768 ? 150 : 250;
    el.style.height = Math.min(el.scrollHeight, maxH) + "px";
  };

  // ── image upload ─────────────────────────────────────────────────────────
  const handleImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Imagem excede o limite de 10MB.");
      return;
    }
    setImageUploading(true);
    setImageProgress(0);

    try {
      const url = await uploadFile(apiKey, file, (pct) => {
        setImageProgress(pct);
      });
      setUploadedImageUrl(url);

      // Clear v2v if active
      setUploadedVideoUrl(null);
      setUploadedVideoName(null);
      setV2vMode(false);

      if (!imageMode) {
        const firstI2V = maxQualityMode
          ? i2vModels.find((m) => m.id === MAX_QUALITY_MODELS.i2v) || i2vModels[0]
          : i2vModels[0];
        setImageMode(true);
        setSelectedModel(firstI2V.id);
        setSelectedModelName(firstI2V.name);
        applyControlsForModel(firstI2V.id, true, false);
      }
      setPromptDisabled(false);
    } catch (err) {
      console.error("[VideoStudio] Image upload failed:", err);
      alert(`Image upload failed: ${err.message}`);
    } finally {
      setImageUploading(false);
      setImageProgress(0);
      if (imageFileInputRef.current) imageFileInputRef.current.value = "";
    }
  };

  const clearImageUpload = () => {
    setUploadedImageUrl(null);
    setImageMode(false);
    const first = maxQualityMode
      ? allT2vModels.find((m) => m.id === MAX_QUALITY_MODELS.t2v) || allT2vModels[0]
      : allT2vModels[0];
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, false, false);
    setPromptDisabled(false);
  };

  // ── video upload ─────────────────────────────────────────────────────────
  const handleVideoFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert("Vídeo excede o limite de 50MB.");
      return;
    }
    setVideoUploading(true);
    setVideoProgress(0);
    try {
      const url = await uploadFile(apiKey, file, (pct) => {
        setVideoProgress(pct);
      });
      setUploadedVideoUrl(url);
      setUploadedVideoName(file.name);

      // Clear image mode if active
      if (imageMode) {
        setUploadedImageUrl(null);
        setImageMode(false);
      }
      setV2vMode(true);
      setMaxQualityMode(false);
      const firstV2V = v2vModels[0];
      setSelectedModel(firstV2V.id);
      setSelectedModelName(firstV2V.name);
      applyControlsForModel(firstV2V.id, false, true);
      setPrompt("");
      setPromptDisabled(true);
    } catch (err) {
      console.error("[VideoStudio] Video upload failed:", err);
      alert(`Video upload failed: ${err.message}`);
    } finally {
      setVideoUploading(false);
      setVideoProgress(0);
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
    }
  };

  const clearVideoUpload = () => {
    setUploadedVideoUrl(null);
    setUploadedVideoName(null);
    setV2vMode(false);
    const first = maxQualityMode
      ? allT2vModels.find((m) => m.id === MAX_QUALITY_MODELS.t2v) || allT2vModels[0]
      : allT2vModels[0];
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, false, false);
    setPromptDisabled(false);
  };

  // ── model selection from dropdown ─────────────────────────────────────────
  const handleModelSelect = useCallback(
    (m, isV2V) => {
      setMaxQualityMode(false);
      if (isV2V) {
        setV2vMode(true);
        setImageMode(false);
        setUploadedImageUrl(null);
        setUploadedImagePreview(null);
        setSelectedModel(m.id);
        setSelectedModelName(m.name);
        applyControlsForModel(m.id, false, true);
        setPrompt("");
        setPromptDisabled(true);
      } else {
        if (v2vMode) {
          setV2vMode(false);
          setUploadedVideoUrl(null);
          setUploadedVideoName(null);
          setPromptDisabled(false);
        }
        setSelectedModel(m.id);
        setSelectedModelName(m.name);
        applyControlsForModel(m.id, imageMode, false);
      }
    },
    [v2vMode, imageMode, applyControlsForModel],
  );

  const applyMaxQualityMode = useCallback(
    (enabled) => {
      setMaxQualityMode(enabled);
      if (!enabled || v2vMode) return;
      const targetId = imageMode ? MAX_QUALITY_MODELS.i2v : MAX_QUALITY_MODELS.t2v;
      const modelList = imageMode ? i2vModels : allT2vModels;
      const target = modelList.find((m) => m.id === targetId);
      if (!target) return;
      setSelectedModel(target.id);
      setSelectedModelName(target.name);
      applyControlsForModel(target.id, imageMode, false);
    },
    [allT2vModels, applyControlsForModel, imageMode, v2vMode],
  );

  // ── add to local history ──────────────────────────────────────────────────
  const addToLocalHistory = useCallback((entry) => {
    setLocalHistory((prev) => [entry, ...prev].slice(0, 30));
    setActiveHistoryIdx(0);
  }, []);

  // ── show result in canvas ─────────────────────────────────────────────────
  const showVideoInCanvas = useCallback((url, model) => {
    setCanvasUrl(url);
    setCanvasModel(model);
    setShowCanvas(true);
  }, []);

  // ── generate ──────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const currentModel = getCurrentModel();
    const isExtendMode = currentModel?.requiresRequestId;
    const trimmedPrompt = prompt.trim();
    const requestModel = maxQualityMode && !v2vMode && !isExtendMode
      ? (imageMode ? MAX_QUALITY_MODELS.i2v : MAX_QUALITY_MODELS.t2v)
      : selectedModel;

    if (v2vMode) {
      if (!uploadedVideoUrl) {
        alert("Por favor, faça upload de um vídeo primeiro.");
        return;
      }
    } else if (isExtendMode) {
      if (!lastGenerationId) {
        alert(
          "Nenhuma geração do Seedance 2.0 encontrada para estender. Gere um vídeo primeiro.",
        );
        return;
      }
    } else if (imageMode) {
      if (!uploadedImageUrl) {
        alert("Por favor, faça upload de uma imagem de quadro inicial primeiro.");
        return;
      }
    } else {
      if (!trimmedPrompt) {
        alert("Por favor, insira um prompt para gerar o vídeo.");
        return;
      }
    }

    setGenerating(true);
    setGenerateError(null);

    let hadError = false;

    try {
      let res;

      if (v2vMode) {
        // V2V: use generateVideo with video_url (the v2v models use the video endpoint)
        res = await generateVideo(apiKey, {
          model: selectedModel,
          video_url: uploadedVideoUrl,
        });
        if (!res?.url) throw new Error("Nenhuma URL de vídeo retornada pela API");

        const genId = res.id || Date.now().toString();
        setLastGenerationId(null);
        setLastGenerationModel(null);
        const entry = {
          id: genId,
          url: res.url,
          prompt: "",
          model: selectedModel,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(res.url, selectedModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: res.url,
            model: selectedModel,
            prompt: "",
            type: "video",
          });
      } else if (imageMode) {
        const i2vParams = { model: requestModel, image_url: uploadedImageUrl };
        if (trimmedPrompt) i2vParams.prompt = trimmedPrompt;
        i2vParams.aspect_ratio = selectedAr;
        const durations = getDurationsForI2VModel(requestModel);
        if (durations.length > 0) i2vParams.duration = selectedDuration;
        const resolutions = getResolutionsForI2VModel(requestModel);
        if (resolutions.length > 0) i2vParams.resolution = selectedResolution;
        if (selectedQuality) i2vParams.quality = selectedQuality;
        if (selectedMode) i2vParams.mode = selectedMode;
        if (maxQualityMode) {
          i2vParams.max_quality = true;
          i2vParams.exact_prompt = true;
          i2vParams.disable_fallback = true;
          i2vParams.provider_mode = "gemini_parity";
          i2vParams.seed = GEMINI_PARITY_SEED;
        }

        res = await generateI2V(apiKey, i2vParams);
        if (!res?.url) throw new Error("Nenhuma URL de vídeo retornada pela API");

        const genId = res.id || Date.now().toString();
        if (requestModel === "seedance-v2.0-i2v") {
          setLastGenerationId(genId);
          setLastGenerationModel(requestModel);
        } else {
          setLastGenerationId(null);
          setLastGenerationModel(null);
        }
        const entry = {
          id: genId,
          url: res.url,
          prompt: trimmedPrompt,
          model: requestModel,
          aspect_ratio: selectedAr,
          duration: selectedDuration,
          resolution: selectedResolution,
          audit: res.audit,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(res.url, requestModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: res.url,
            model: requestModel,
            prompt: trimmedPrompt,
            type: "video",
            audit: res.audit,
          });
      } else {
        // T2V (including extend mode)
        const params = { model: requestModel };
        if (trimmedPrompt) params.prompt = trimmedPrompt;

        if (isExtendMode) {
          params.request_id = lastGenerationId;
        } else {
          params.aspect_ratio = selectedAr;
        }

        const durations = getDurationsForModel(requestModel);
        if (durations.length > 0) params.duration = selectedDuration;
        const resolutions = getResolutionsForVideoModel(requestModel);
        if (resolutions.length > 0) params.resolution = selectedResolution;
        if (selectedQuality) params.quality = selectedQuality;
        if (selectedMode) params.mode = selectedMode;
        if (maxQualityMode) {
          params.max_quality = true;
          params.exact_prompt = true;
          params.disable_fallback = true;
          params.provider_mode = "gemini_parity";
          params.seed = GEMINI_PARITY_SEED;
        }

        res = await generateVideo(apiKey, params);
        if (!res?.url) throw new Error("Nenhuma URL de vídeo retornada pela API");

        const genId = res.id || Date.now().toString();
        if (
          requestModel === "seedance-v2.0-t2v" ||
          requestModel === "seedance-v2.0-i2v"
        ) {
          setLastGenerationId(genId);
          setLastGenerationModel(requestModel);
        } else {
          setLastGenerationId(null);
          setLastGenerationModel(null);
        }
        const entry = {
          id: genId,
          url: res.url,
          prompt: trimmedPrompt,
          model: requestModel,
          aspect_ratio: selectedAr,
          duration: selectedDuration,
          resolution: selectedResolution,
          audit: res.audit,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(res.url, requestModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: res.url,
            model: requestModel,
            prompt: trimmedPrompt,
            type: "video",
            audit: res.audit,
          });
      }
    } catch (e) {
      hadError = true;
      console.error("[VideoStudio]", e);
      setGenerateError(e.message?.slice(0, 80) || "Falha na geração");
      setTimeout(() => setGenerateError(null), 4000);
    } finally {
      setGenerating(false);
    }
  }, [
    apiKey,
    prompt,
    v2vMode,
    imageMode,
    maxQualityMode,
    selectedModel,
    selectedAr,
    selectedDuration,
    selectedResolution,
    selectedQuality,
    selectedMode,
    uploadedImageUrl,
    uploadedVideoUrl,
    lastGenerationId,
    getCurrentModel,
    addToLocalHistory,
    showVideoInCanvas,
    onGenerationComplete,
  ]);

  // ── reset to prompt bar ───────────────────────────────────────────────────
  const resetToPromptBar = useCallback(() => {
    setShowCanvas(false);
  }, []);

  const handleNewPrompt = useCallback(() => {
    resetToPromptBar();
    setPrompt("");
    setUploadedImageUrl(null);
    setUploadedImagePreview(null);
    setImageMode(false);
    setUploadedVideoUrl(null);
    setUploadedVideoName(null);
    setV2vMode(false);
    const first = allT2vModels[0];
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, false, false);
    setPromptDisabled(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [resetToPromptBar, applyControlsForModel]);

  const handleExtend = useCallback(() => {
    if (!lastGenerationId) return;
    resetToPromptBar();
    setPrompt("");
    setUploadedImageUrl(null);
    setUploadedImagePreview(null);
    setImageMode(false);
    setSelectedModel("seedance-v2.0-extend");
    setSelectedModelName("Seedance 2.0 Extend");
    applyControlsForModel("seedance-v2.0-extend", false, false);
    setPromptDisabled(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [lastGenerationId, resetToPromptBar, applyControlsForModel]);

  // ── derived UI values ────────────────────────────────────────────────────
  const isSeedance2Canvas =
    canvasModel === "seedance-v2.0-t2v" || canvasModel === "seedance-v2.0-i2v";
  const currentModelObj = getCurrentModel();
  const isExtendMode = currentModelObj?.requiresRequestId;

  const promptPlaceholder = v2vMode
    ? "Vídeo pronto — clique em Gerar para remover marca d'água"
    : imageMode
      ? "Descreva o movimento ou efeito (opcional)"
      : isExtendMode
        ? "Opcional: descreva como continuar o vídeo..."
        : "Descreva o vídeo que deseja criar";

  const toggleDropdown = (type) => (e) => {
    e.stopPropagation();
    setOpenDropdown((prev) => (prev === type ? null : type));
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="w-full h-full flex overflow-hidden bg-app-bg relative"
    >
      {/* ── LEFT SIDEBAR ── */}
      <aside
        className="hidden md:flex w-[320px] shrink-0 flex-col border-r bg-[#080808] relative z-10"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        {/* Tab nav */}
        <div className="flex shrink-0 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {["Criar Vídeo", "Editar Vídeo"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSidebarTab(tab)}
              className="flex-1 py-3 transition-all"
              style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: sidebarTab === tab ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
                borderBottom: sidebarTab === tab ? "2px solid #FF4500" : "2px solid transparent",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Scrollable sidebar content */}
        <div className="flex-1 flex flex-col gap-4 p-4 overflow-y-auto custom-scrollbar">

          {/* Start Frame */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
              Quadro Inicial
            </p>
            <input ref={imageFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFileChange} />
            <div
              className="relative w-full rounded-xl overflow-hidden cursor-pointer group transition-all"
              style={{
                aspectRatio: "16/9",
                border: uploadedImageUrl ? "2px solid rgba(255,69,0,0.4)" : "2px dashed rgba(255,255,255,0.08)",
                background: uploadedImageUrl ? "transparent" : "rgba(255,255,255,0.015)",
              }}
              onClick={() => uploadedImageUrl ? clearImageUpload() : imageFileInputRef.current?.click()}
            >
              {imageUploading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-10">
                  <svg className="w-10 h-10 -rotate-90">
                    <circle cx="20" cy="20" r="18" stroke="rgba(255,255,255,0.1)" strokeWidth="2" fill="transparent" />
                    <circle cx="20" cy="20" r="18" stroke="#FF4500" strokeWidth="2" fill="transparent"
                      strokeDasharray={113} strokeDashoffset={113 - (113 * imageProgress) / 100}
                      className="transition-all duration-300" />
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 900, color: "#FF4500", marginTop: 4 }}>{imageProgress}%</span>
                </div>
              )}
              {uploadedImageUrl ? (
                <>
                  <img src={uploadedImageUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.55)" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "white" }}>Remover imagem</span>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 transition-colors"
                  style={{ color: "rgba(255,255,255,0.2)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>Adicionar imagem</span>
                </div>
              )}
            </div>
          </div>

          {/* End Frame (disabled / coming soon) */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.18)", marginBottom: 8 }}>
              Quadro Final <span style={{ textTransform: "none", fontWeight: 400, color: "rgba(255,255,255,0.12)" }}>— opcional</span>
            </p>
            <div className="relative w-full rounded-xl flex items-center justify-center opacity-30 cursor-not-allowed"
              style={{ aspectRatio: "16/9", border: "2px dashed rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
              <div className="flex flex-col items-center gap-1.5" style={{ color: "rgba(255,255,255,0.2)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span style={{ fontSize: 10, fontWeight: 600 }}>Em breve</span>
              </div>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
              Prompt
            </p>
            <div className="rounded-xl p-3 transition-all"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={handlePromptInput}
                placeholder={promptPlaceholder}
                disabled={promptDisabled}
                rows={4}
                className="w-full bg-transparent border-none text-white text-sm focus:outline-none resize-none leading-relaxed disabled:opacity-40"
                style={{ color: "rgba(255,255,255,0.85)", fontSize: 13 }}
              />
            </div>
          </div>

          {/* Video input (V2V) */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
              Entrada de Vídeo <span style={{ textTransform: "none", fontWeight: 400, color: "rgba(255,255,255,0.15)" }}>— para edição</span>
            </p>
            <input ref={videoFileInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoFileChange} />
            <div
              className="relative w-full h-14 rounded-xl flex items-center justify-center cursor-pointer group overflow-hidden transition-all"
              style={{
                border: uploadedVideoUrl ? "2px solid rgba(255,69,0,0.35)" : "2px dashed rgba(255,255,255,0.07)",
                background: uploadedVideoUrl ? "rgba(255,69,0,0.04)" : "rgba(255,255,255,0.01)",
              }}
              onClick={() => uploadedVideoUrl ? clearVideoUpload() : videoFileInputRef.current?.click()}
            >
              {videoUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10 gap-2">
                  <svg className="w-8 h-8 -rotate-90">
                    <circle cx="16" cy="16" r="14" stroke="rgba(255,255,255,0.1)" strokeWidth="2" fill="transparent" />
                    <circle cx="16" cy="16" r="14" stroke="#FF4500" strokeWidth="2" fill="transparent"
                      strokeDasharray={88} strokeDashoffset={88 - (88 * videoProgress) / 100}
                      className="transition-all duration-300" />
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 900, color: "#FF4500" }}>{videoProgress}%</span>
                </div>
              )}
              {uploadedVideoUrl ? (
                <>
                  <video src={uploadedVideoUrl} className="absolute inset-0 w-full h-full object-cover opacity-30" muted />
                  <div className="relative flex items-center gap-2" style={{ color: "rgba(255,69,0,0.85)" }}>
                    <VideoReadySvg />
                    <span style={{ fontSize: 11, fontWeight: 600 }} className="truncate max-w-[140px]">{uploadedVideoName || "Vídeo pronto"}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>— limpar</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 transition-colors group-hover:opacity-70"
                  style={{ color: "rgba(255,255,255,0.25)" }}>
                  <VideoIconSvg className="" />
                  <span style={{ fontSize: 11, fontWeight: 600 }}>Upload de vídeo</span>
                </div>
              )}
            </div>
          </div>

          {/* Model selector */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
              Modelo
            </p>
            <div className="relative">
              <button
                type="button"
                onClick={toggleDropdown("model")}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl transition-all group"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "#FF4500", boxShadow: "0 0 12px rgba(255,69,0,0.3)" }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: "black" }}>V</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{selectedModelName}</span>
                </div>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ opacity: 0.3 }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {openDropdown === "model" && (
                <div
                  ref={dropdownRef}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-[calc(100%+8px)] left-0 z-50 rounded-[1.5rem] p-3 shadow-2xl w-full"
                  style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.06)", maxHeight: 320, overflowY: "auto" }}
                >
                  <ModelDropdown
                    imageMode={imageMode}
                    selectedModel={selectedModel}
                    onSelect={handleModelSelect}
                    onClose={() => setOpenDropdown(null)}
                  />
                </div>
              )}
            </div>

            {!v2vMode && (
              <button
                type="button"
                onClick={() => applyMaxQualityMode(!maxQualityMode)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all"
                style={{
                  background: maxQualityMode ? "rgba(255,69,0,0.12)" : "rgba(255,255,255,0.03)",
                  border: maxQualityMode ? "1px solid rgba(255,69,0,0.35)" : "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div className="flex flex-col items-start">
                  <span style={{ fontSize: 11, fontWeight: 800, color: maxQualityMode ? "#FF4500" : "rgba(255,255,255,0.75)" }}>
                    Paridade Gemini
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                    Veo 3.1 padrão • prompt exato
                  </span>
                </div>
                <span
                  className="relative inline-flex h-5 w-9 items-center rounded-full transition-all"
                  style={{ background: maxQualityMode ? "#FF4500" : "rgba(255,255,255,0.12)" }}
                >
                  <span
                    className="inline-block h-4 w-4 rounded-full bg-black transition-all"
                    style={{ transform: maxQualityMode ? "translateX(18px)" : "translateX(2px)" }}
                  />
                </span>
              </button>
            )}
          </div>

          {/* AR / Duration / Resolution grid */}
          {(showAr || showDuration || showResolution) && (
            <div className="grid grid-cols-2 gap-2">
              {showAr && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("ar")}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all group"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex flex-col items-start">
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Proporção</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>{selectedAr}</span>
                    </div>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ opacity: 0.2 }}><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {openDropdown === "ar" && (
                    <div ref={dropdownRef} onClick={(e) => e.stopPropagation()}
                      className="absolute top-[calc(100%+8px)] left-0 z-50 rounded-xl p-3 shadow-2xl min-w-[140px] max-h-60 overflow-y-auto custom-scrollbar"
                      style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.2)", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: 6, marginBottom: 6 }}>Proporção</div>
                      {getCurrentAspectRatios(selectedModel).map((r) => (
                        <div key={r} className="flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg cursor-pointer transition-all"
                          onClick={(e) => { e.stopPropagation(); setSelectedAr(r); setOpenDropdown(null); }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{r}</span>
                          {selectedAr === r && <CheckSvg />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {showDuration && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("duration")}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex flex-col items-start">
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Duração</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>{selectedDuration}s</span>
                    </div>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ opacity: 0.2 }}><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {openDropdown === "duration" && (
                    <div ref={dropdownRef} onClick={(e) => e.stopPropagation()}
                      className="absolute top-[calc(100%+8px)] left-0 z-50 rounded-xl p-3 shadow-2xl min-w-[130px]"
                      style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.2)", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: 6, marginBottom: 6 }}>Duração</div>
                      {getCurrentDurations(selectedModel).map((d) => (
                        <div key={d} className="flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg cursor-pointer transition-all"
                          onClick={(e) => { e.stopPropagation(); setSelectedDuration(d); setOpenDropdown(null); }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{d}s</span>
                          {selectedDuration === d && <CheckSvg />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {showResolution && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("resolution")}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex flex-col items-start">
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Resolução</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>{selectedResolution || "720p"}</span>
                    </div>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ opacity: 0.2 }}><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {openDropdown === "resolution" && (
                    <div ref={dropdownRef} onClick={(e) => e.stopPropagation()}
                      className="absolute top-[calc(100%+8px)] left-0 z-50 rounded-xl p-3 shadow-2xl min-w-[140px]"
                      style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.2)", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: 6, marginBottom: 6 }}>Resolução</div>
                      {getCurrentResolutions(selectedModel).map((r) => (
                        <div key={r} className="flex items-center justify-between p-2.5 hover:bg-white/5 rounded-lg cursor-pointer transition-all"
                          onClick={(e) => { e.stopPropagation(); setSelectedResolution(r); setOpenDropdown(null); }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{r}</span>
                          {selectedResolution === r && <CheckSvg />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Extend banner */}
          {isExtendMode && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(255,69,0,0.05)", border: "1px solid rgba(255,69,0,0.12)", fontSize: 10, color: "rgba(255,69,0,0.8)", fontWeight: 500 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Estendendo geração anterior do Seedance 2.0
            </div>
          )}
        </div>

        {/* Generate button — pinned to sidebar bottom */}
        <div className="p-4 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {generateError && (
            <p className="text-center mb-2" style={{ fontSize: 11, color: "rgba(220,38,38,0.85)" }}>{generateError}</p>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
            style={{
              background: generating ? "rgba(255,69,0,0.7)" : "#FF4500",
              boxShadow: "0 4px 24px rgba(255,69,0,0.25)",
              fontSize: 13,
              fontWeight: 900,
              color: "black",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {generating ? (
              <>
                <span className="animate-spin">◌</span>
                Gerando...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Gerar
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── MAIN CANVAS ── */}
      <main className="flex-1 overflow-y-auto custom-scrollbar relative">
        {history.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 p-6 animate-fade-in-up">
            {history.map((entry, idx) => {
              const isSeedance2 = entry.model === "seedance-v2.0-t2v" || entry.model === "seedance-v2.0-i2v";
              return (
                <div
                  key={entry.id || idx}
                  className="relative group rounded-xl overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl hover:border-primary/50 transition-all duration-300 flex flex-col"
                >
                  <video
                    src={entry.url}
                    className="w-full aspect-video object-cover bg-black/40 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setFullscreenUrl(entry.url)}
                    controls={false}
                    loop
                    muted
                    playsInline
                    onMouseOver={(e) => e.target.play()}
                    onMouseOut={(e) => { e.target.pause(); e.target.currentTime = 0; }}
                  />
                  <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" title="Tela cheia"
                      onClick={(e) => { e.stopPropagation(); setFullscreenUrl(entry.url); }}
                      className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    </button>
                    <button type="button" title="Baixar"
                      onClick={(e) => { e.stopPropagation(); downloadFile(entry.url, `video-${entry.id || idx}.mp4`); }}
                      className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </button>
                    <button type="button" title="Enviar para Editor"
                      onClick={(e) => {
                        e.stopPropagation();
                        const clip = { url: entry.url, duration: entry.duration || 5, label: entry.prompt?.slice(0, 40) || "Generated clip" };
                        const pending = JSON.parse(localStorage.getItem("video_editor_pending_clips") || "[]");
                        localStorage.setItem("video_editor_pending_clips", JSON.stringify([...pending, clip]));
                        window.dispatchEvent(new CustomEvent("add-to-editor", { detail: clip }));
                      }}
                      className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                    {isSeedance2 && (
                      <button type="button" title="Extend with Seedance 2.0 Extend"
                        onClick={(e) => { e.stopPropagation(); setLastGenerationId(entry.id); handleExtend(); }}
                        className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="p-3 bg-black/80 backdrop-blur-sm border-t border-white/5 flex-1 flex flex-col justify-between gap-2">
                    <p className="text-white/70 text-xs line-clamp-3 leading-relaxed" title={entry.prompt}>
                      {entry.prompt || "Sem prompt"}
                    </p>
                    <GenerationDiagnostics audit={entry.audit} />
                    <div className="flex items-center justify-between mt-1 flex-wrap gap-1">
                      <span className="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20 whitespace-nowrap">
                        {entry.model?.replace("-", " ")}
                      </span>
                      <div className="flex gap-2">
                        {entry.resolution && <span className="text-[10px] text-white/40">{entry.resolution}</span>}
                        {entry.duration && <span className="text-[10px] text-white/40">{entry.duration}s</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Empty hero ── */
          <div className="relative flex flex-col items-center justify-center min-h-full px-8 py-16 animate-fade-in-up">
            {/* Atmospheric glow */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: "radial-gradient(ellipse 80% 60% at 50% 35%, rgba(255,69,0,0.07) 0%, transparent 65%)",
              filter: "blur(40px)",
            }} />
            {/* Corner guides */}
            <div className="absolute hidden lg:block" style={{ top: "8%", left: "5%", width: 20, height: 20, borderTop: "1.5px solid rgba(255,255,255,0.1)", borderLeft: "1.5px solid rgba(255,255,255,0.1)" }} />
            <div className="absolute hidden lg:block" style={{ top: "8%", right: "5%", width: 20, height: 20, borderTop: "1.5px solid rgba(255,255,255,0.1)", borderRight: "1.5px solid rgba(255,255,255,0.1)" }} />
            <div className="absolute hidden lg:block" style={{ bottom: "8%", left: "5%", width: 20, height: 20, borderBottom: "1.5px solid rgba(255,255,255,0.1)", borderLeft: "1.5px solid rgba(255,255,255,0.1)" }} />
            <div className="absolute hidden lg:block" style={{ bottom: "8%", right: "5%", width: 20, height: 20, borderBottom: "1.5px solid rgba(255,255,255,0.1)", borderRight: "1.5px solid rgba(255,255,255,0.1)" }} />

            {/* Headline */}
            <div className="relative z-10 text-center mb-14">
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(255,255,255,0.2)", marginBottom: 20 }}>
                COMECE A CRIAR COM
              </p>
              <h1
                className="font-black uppercase text-center bg-gradient-to-b from-white via-white/90 to-white/30 bg-clip-text text-transparent"
                style={{ fontSize: "clamp(36px, 5.5vw, 72px)", letterSpacing: "-0.02em", lineHeight: 0.92 }}
              >
                CRIE VÍDEOS<br />COM UM CLIQUE
              </h1>
            </div>

            {/* 3 action cards */}
            <div className="relative z-10 flex flex-col sm:flex-row gap-4 w-full max-w-xl">
              {/* Add Image */}
              <button
                type="button"
                onClick={() => imageFileInputRef.current?.click()}
                className="flex-1 flex flex-col items-start gap-3 p-5 rounded-2xl text-left transition-all group"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,69,0,0.04)"; e.currentTarget.style.borderColor = "rgba(255,69,0,0.25)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,69,0,0.1)", border: "1px solid rgba(255,69,0,0.2)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF4500" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.75)" }}>Adicionar Imagem</p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3, lineHeight: 1.5 }}>Quadro inicial para Imagem-para-Vídeo</p>
                </div>
              </button>

              {/* Choose Preset */}
              <div
                className="flex-1 flex flex-col items-start gap-3 p-5 rounded-2xl opacity-40 cursor-not-allowed"
                style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                  </svg>
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.5)" }}>Escolher Preset</p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 3, lineHeight: 1.5 }}>Presets de estilo — em breve</p>
                </div>
              </div>

              {/* Get Video */}
              <button
                type="button"
                onClick={() => textareaRef.current?.focus()}
                className="flex-1 flex flex-col items-start gap-3 p-5 rounded-2xl text-left transition-all"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.75)" }}>Gerar Vídeo</p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3, lineHeight: 1.5 }}>Digite um prompt e gere</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── MOBILE: compact bottom bar (shown only on small screens) ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 p-3"
        style={{ background: "rgba(8,8,8,0.95)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-2">
          <input ref={imageFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFileChange} />
          <button type="button"
            onClick={() => uploadedImageUrl ? clearImageUpload() : imageFileInputRef.current?.click()}
            className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center overflow-hidden relative transition-all"
            style={{ border: uploadedImageUrl ? "1.5px solid rgba(255,69,0,0.5)" : "1.5px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
            {uploadedImageUrl
              ? <img src={uploadedImageUrl} alt="" className="w-full h-full object-cover rounded-full" />
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "rgba(255,255,255,0.35)" }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                </svg>
            }
          </button>
          <input ref={videoFileInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoFileChange} />
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={handlePromptInput}
              placeholder={promptPlaceholder}
              disabled={promptDisabled}
              rows={1}
              className="w-full bg-transparent border-none text-white text-sm focus:outline-none resize-none leading-relaxed disabled:opacity-40"
              style={{ minHeight: 38, maxHeight: 120, color: "rgba(255,255,255,0.85)", fontSize: 13 }}
            />
          </div>
          <button type="button" onClick={handleGenerate} disabled={generating}
            className="shrink-0 px-4 py-2.5 rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: "#FF4500", color: "black", fontSize: 12, fontWeight: 900 }}>
            {generating ? <span className="animate-spin">◌</span> : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>}
            {generating ? "" : "Gerar"}
          </button>
        </div>
      </div>

      {/* ── FULLSCREEN VIDEO MODAL ── */}
      {fullscreenUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
          onClick={() => setFullscreenUrl(null)}
        >
          <button type="button"
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/10"
            onClick={(e) => { e.stopPropagation(); setFullscreenUrl(null); }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <video src={fullscreenUrl} controls autoPlay loop
            className="max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl object-contain animate-scale-up"
            onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
