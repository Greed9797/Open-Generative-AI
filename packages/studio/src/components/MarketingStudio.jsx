"use client";

import { useState, useEffect, useRef } from "react";
import { uploadFile, generateMarketingStudioAd } from "../muapi.js";

// ── Scrollbar style ──────────────────────────────────────────────────────────

const SCROLLBAR_STYLE = `
  .ms-scroll::-webkit-scrollbar { height: 4px; width: 4px; }
  .ms-scroll::-webkit-scrollbar-track { background: transparent; }
  .ms-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
`;

// ── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CloseIcon = ({ size = 10 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const PhoneIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

const QualityIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const ClockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const SparkleIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
  </svg>
);

const VideoIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="2" y="7" width="15" height="14" rx="2" /><polyline points="17 8 22 4 22 20 17 16" />
  </svg>
);

const ProductShapeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 8l-2-2H5L3 8v10a2 2 0 002 2h14a2 2 0 002-2V8z" />
    <path d="M3 10h18" />
    <path d="M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
  </svg>
);

const AvatarShapeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const AppIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

// ── Data ─────────────────────────────────────────────────────────────────────

const ASSETS = {
  avatar: [
    { id: "aa252283-8591-4d14-91a8-41ce54187992", name: "Priya", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Priya.webp" },
    { id: "ba6c9b18-f79c-4dab-9649-88a181d0a038", name: "Elena", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Elena.webp" },
    { id: "30e2cadd-987c-4a7a-81c3-094d4fb3a65e", name: "Kai",   url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Kai.webp" },
    { id: "fbed59e1-4b8d-4625-9140-ef2044e0be72", name: "Sora",  url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Sora.webp" },
    { id: "bcd9e6ee-c000-48e6-9f4b-a20fc2a674f7", name: "Minji", url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Minji.webp" },
    { id: "1da384ed-3856-45e4-bf4c-a496c7aa95ff", name: "Margot",url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Margot.webp" },
    { id: "b799c8f5-fb6e-4905-b33b-cdefac153ec3", name: "Niko",  url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Niko.webp" },
    { id: "b6971dd4-55fa-4e64-b318-392b16504284", name: "Jin",   url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Jin.webp" }
  ],
  ugc: [
    { id: 1,  name: "UGC",                url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/ugc.mp4",                    desc: "Realistic social media video" },
    { id: 2,  name: "Tutorial",            url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/ugc_how_to.mp4",            desc: "Step-by-step tutorials" },
    { id: 3,  name: "Unboxing",            url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/ugc_unboxing.mp4",          desc: "High-quality unboxing" },
    { id: 4,  name: "Hyper Motion",        url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/hyper-motion-mini.mp4",     desc: "Highlight your product" },
    { id: 5,  name: "Product Review",      url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/product_review.mp4",        desc: "Authentic product review" },
    { id: 6,  name: "TV Spot",             url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/tv-spot-mini.mp4",          desc: "Authentic stories, amplified" },
    { id: 7,  name: "Wild Card",           url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/wild-card.mp4",             desc: "A unique and creative video" },
    { id: 8,  name: "UGC Virtual Try On",  url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/ugc_virtual_try_on.mp4",   desc: "Try before you buy" },
    { id: 9,  name: "Pro Virtual Try On",  url: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/pro_virtual_try_on.mp4",   desc: "Advanced virtual try-on" }
  ]
};

const MODELS = [
  { id: "auto",                              name: "Auto",          label: "Auto" },
  { id: "sd-2-vip-omni-reference-1080p",     name: "Seedance 2 VIP 1080p", label: "SD2 1080p" },
  { id: "seedance-2-vip-omni-reference",     name: "Seedance 2 VIP",        label: "SD2 720p" },
];

const OPTIONS = {
  ratio:    ["9:16", "3:4", "1:1", "4:3", "16:9"],
  res:      ["720p", "1080p"],
  duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
};

// ── Chip Dropdown ─────────────────────────────────────────────────────────────

function ChipDropdown({ isOpen, onClose, title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener("click", fn);
    return () => window.removeEventListener("click", fn);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return (
    <div
      ref={ref}
      className="absolute bottom-[calc(100%+10px)] left-0 z-50 bg-[#111] border border-white/10 rounded-xl shadow-2xl p-3 min-w-[160px] animate-fade-in-up"
    >
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-2 px-1">{title}</div>
      {children}
    </div>
  );
}

function SimpleChipDropdown({ isOpen, title, options, selected, onSelect, onClose, renderLabel }) {
  return (
    <ChipDropdown isOpen={isOpen} title={title} onClose={onClose}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => { onSelect(opt); onClose(); }}
          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between gap-2 transition-all ${
            selected === opt ? "bg-primary/10 text-primary" : "text-white/50 hover:bg-white/5 hover:text-white"
          }`}
        >
          <span>{renderLabel ? renderLabel(opt) : opt}</span>
          {selected === opt && <CheckIcon />}
        </button>
      ))}
    </ChipDropdown>
  );
}

function FormatPicker({ isOpen, items, selectedId, onSelect, onClose }) {
  const [hovered, setHovered] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener("click", fn);
    return () => window.removeEventListener("click", fn);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const preview = hovered || items.find(i => i.id === selectedId || i.name === selectedId) || items[0];

  return (
    <div
      ref={ref}
      className="absolute bottom-[calc(100%+12px)] left-0 z-50 w-[min(820px,95vw)] bg-[#111]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up"
      onClick={e => e.stopPropagation()}
    >
      {/* Header row */}
      <div className="flex items-stretch gap-0">
        {/* Left: title + description */}
        <div className="flex-1 p-6 flex flex-col justify-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white flex items-center justify-center transition-all"
          >
            <CloseIcon size={10} />
          </button>
          <h2 className="text-xl font-black uppercase text-white tracking-tight leading-tight">
            PICK THE FORMAT<br />THAT HITS
          </h2>
          <p className="text-xs text-white/40 leading-relaxed max-w-[260px]">
            From unboxing to UGC — choose the type of video that fits your product and audience.
          </p>
          {preview && (
            <div className="mt-1">
              <span className="text-sm font-black text-white">{preview.name}</span>
              {preview.desc && <p className="text-[11px] text-white/40 mt-0.5">{preview.desc}</p>}
            </div>
          )}
        </div>

        {/* Right: featured preview */}
        {preview && (
          <div className="w-[160px] shrink-0 relative overflow-hidden rounded-tr-2xl">
            <video
              key={preview.url}
              src={preview.url}
              autoPlay loop muted playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#111]/80 to-transparent" />
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.06]" />

      {/* Format grid */}
      <div className="p-4 grid grid-cols-4 gap-3 max-h-[360px] overflow-y-auto ms-scroll">
        {items.map(item => {
          const isSelected = item.id === selectedId || item.name === selectedId;
          return (
            <div
              key={item.id}
              onClick={() => { onSelect(item); onClose(); }}
              onMouseEnter={() => setHovered(item)}
              onMouseLeave={() => setHovered(null)}
              className={`relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all group ${
                isSelected ? "border-primary" : "border-white/[0.04] hover:border-white/20"
              }`}
            >
              <video
                src={item.url}
                autoPlay loop muted playsInline
                className="w-full aspect-[3/4] object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {/* Pin/bookmark icon */}
              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/80">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
              {isSelected && (
                <div className="absolute top-2 left-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-md">
                  <CheckIcon />
                </div>
              )}
              {/* Name + desc overlay */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2.5 pt-6">
                <p className="text-[11px] font-black text-white leading-tight">{item.name}</p>
                {item.desc && <p className="text-[9px] text-white/50 mt-0.5 leading-tight line-clamp-1">{item.desc}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AvatarPicker({ isOpen, items, selectedId, onSelect, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener("click", fn);
    return () => window.removeEventListener("click", fn);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return (
    <div
      ref={ref}
      className="absolute bottom-[calc(100%+10px)] right-0 z-50 bg-[#111]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-4 w-[340px] animate-fade-in-up"
      onClick={e => e.stopPropagation()}
    >
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-3 px-1">Select Avatar</div>
      <div className="grid grid-cols-4 gap-2 max-h-[260px] overflow-y-auto ms-scroll">
        {items.map(item => {
          const isSelected = item.url === selectedId;
          return (
            <div
              key={item.id}
              onClick={() => { onSelect(item); onClose(); }}
              className={`relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all group ${
                isSelected ? "border-primary" : "border-white/[0.04] hover:border-white/20"
              }`}
            >
              <img src={item.url} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500" alt={item.name} />
              {isSelected && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                  <CheckIcon />
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-4">
                <p className="text-[9px] font-black text-white leading-tight">{item.name}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ icon, label, active, onClick, hasDropdown }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
        active
          ? "border-primary/40 text-primary bg-primary/5"
          : "border-white/[0.06] text-white/50 bg-white/[0.02] hover:bg-white/[0.06] hover:text-white hover:border-white/15"
      }`}
    >
      {icon && <span className="opacity-70">{icon}</span>}
      <span>{label}</span>
      {hasDropdown && <span className="opacity-40 ml-0.5"><ChevronIcon /></span>}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MarketingStudio({ apiKey, droppedFiles, onFilesHandled }) {
  const PERSIST_KEY = "hg_marketing_studio_v2";

  const [prompt, setPrompt]           = useState("");
  const [productImage, setProductImage] = useState(null);
  const [avatarImage, setAvatarImage]  = useState(null);
  const [additionalImages, setAdditionalImages] = useState([]);

  const [params, setParams] = useState({
    ratio:    "9:16",
    format:   ASSETS.ugc[0].name,
    videoUrl: ASSETS.ugc[0].url,
    res:      "720p",
    duration: 8
  });

  const [model, setModel]           = useState("auto");
  const [adMode, setAdMode]         = useState("product");
  const [history, setHistory]       = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dropdown, setDropdown]     = useState(null);
  const [uploadProgress, setUploadProgress] = useState({ product: 0, avatar: 0, additional: 0 });
  const [fullscreenUrl, setFullscreenUrl] = useState(null);

  const textareaRef = useRef(null);

  // ── Persistence ──────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(PERSIST_KEY) || "{}");
      if (data.prompt)           setPrompt(data.prompt);
      if (data.params)           setParams(data.params);
      if (data.model)            setModel(data.model);
      if (data.productImage)     setProductImage(data.productImage);
      if (data.avatarImage)      setAvatarImage(data.avatarImage);
      if (data.additionalImages) setAdditionalImages(data.additionalImages);
      if (data.history)          setHistory(data.history);
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({ prompt, params, model, productImage, avatarImage, additionalImages, history }));
    }, 500);
    return () => clearTimeout(t);
  }, [prompt, params, model, productImage, avatarImage, additionalImages, history]);

  // ── Upload ───────────────────────────────────────────────────────────────

  const handleUpload = async (e, target) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (target === "additional") {
      const toUpload = files.slice(0, 6 - additionalImages.length);
      for (const file of toUpload) {
        try {
          const url = await uploadFile(apiKey, file, (p) => setUploadProgress(prev => ({ ...prev, additional: p })));
          setAdditionalImages(prev => [...prev, url].slice(0, 6));
        } catch (err) { alert(err.message); }
      }
    } else {
      try {
        const url = await uploadFile(apiKey, files[0], (p) => setUploadProgress(prev => ({ ...prev, [target]: p })));
        if (target === "product") setProductImage(url);
        else setAvatarImage(url);
      } catch (err) { alert(err.message); }
    }
    setUploadProgress(p => ({ ...p, [target]: 0 }));
  };

  // ── Generate ─────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!prompt.trim())   return alert("Insira um roteiro para o anúncio.");
    if (!productImage)    return alert("Faça upload de uma imagem do produto.");
    setIsGenerating(true);
    try {
      const modelOverride = model !== "auto" ? model : undefined;
      const result = await generateMarketingStudioAd(apiKey, {
        prompt,
        aspect_ratio: params.ratio,
        duration:     params.duration,
        resolution:   params.res,
        images_list:  [productImage, avatarImage, ...additionalImages].filter(Boolean),
        video_files:  params.videoUrl ? [params.videoUrl] : [],
        modelOverride
      });
      if (result?.url) {
        const entry = { id: Date.now(), url: result.url, prompt, format: params.format, timestamp: new Date().toISOString() };
        setHistory(prev => [entry, ...prev]);
        setFullscreenUrl(result.url);
      }
    } catch (err) {
      alert("Falha na geração: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── File drop ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!droppedFiles?.length) return;
    const file = droppedFiles[0];
    if (!file.type.startsWith("image/")) return;
    uploadFile(apiKey, file, (p) => setUploadProgress(prev => ({ ...prev, product: p })))
      .then(url => { setProductImage(url); setUploadProgress(p => ({ ...p, product: 0 })); })
      .catch(err => alert(err.message));
    onFilesHandled?.();
  }, [droppedFiles]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const cost = params.res === "1080p" ? (params.duration * 0.675).toFixed(0) : (params.duration * 0.3).toFixed(0);

  const selectedModel = MODELS.find(m => m.id === model) || MODELS[0];

  const openDropdown = (key, e) => {
    e.stopPropagation();
    setDropdown(d => d === key ? null : key);
  };

  const productInputRef = useRef(null);
  const avatarInputRef  = useRef(null);
  const addlInputRef    = useRef(null);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col bg-app-bg relative overflow-hidden">
      <style>{SCROLLBAR_STYLE}</style>

      {/* ── History / Hero ── */}
      <div className="flex-1 overflow-y-auto ms-scroll p-6 pb-36">
        {history.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in-up">
            {history.map(entry => (
              <div key={entry.id} className="relative group rounded-xl overflow-hidden border border-white/10 bg-[#0a0a0a] hover:border-primary/40 transition-all flex flex-col">
                <video
                  src={entry.url}
                  className="w-full aspect-video object-cover cursor-pointer hover:opacity-75 transition-opacity"
                  muted loop
                  onClick={() => setFullscreenUrl(entry.url)}
                  onMouseOver={e => e.target.play()}
                  onMouseOut={e => { e.target.pause(); e.target.currentTime = 0; }}
                />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1.5">
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(entry.url);
                        const blob = await res.blob();
                        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `ad-${entry.id}.mp4` });
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                      } catch { window.open(entry.url, "_blank"); }
                    }}
                    className="p-2 bg-black/60 backdrop-blur-sm rounded-full border border-white/10 text-white hover:bg-primary hover:text-black transition-all"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
                </div>
                <div className="p-3 border-t border-white/5 flex items-center justify-between gap-2">
                  <p className="text-white/50 text-[10px] line-clamp-1 font-medium flex-1 min-w-0">{entry.prompt}</p>
                  <span className="text-[9px] font-black text-primary px-2 py-0.5 bg-primary/10 border border-primary/20 rounded uppercase tracking-tight shrink-0">{entry.format}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center min-h-[55vh] relative select-none">
            {/* Atmospheric glow */}
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                inset: 0,
                background: "radial-gradient(ellipse 80% 70% at 50% -10%, rgba(255,69,0,0.22) 0%, rgba(160,20,60,0.12) 40%, transparent 68%)",
              }}
            />
            <div className="relative z-10 flex flex-col items-center gap-3 text-center px-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/30">MARKETING STUDIO</p>
              <h1
                className="font-black uppercase text-white leading-none"
                style={{ fontSize: "clamp(36px, 5.5vw, 82px)", letterSpacing: "-0.02em", lineHeight: 0.92 }}
              >
                TURN ANY PRODUCT<br />INTO A VIDEO AD
              </h1>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Prompt Bar ── */}
      <div className="absolute bottom-4 inset-x-4 z-40 flex justify-center">
        <div
          className="w-full max-w-4xl bg-[#0d0d0d]/90 backdrop-blur-2xl border border-white/[0.07] rounded-2xl shadow-2xl overflow-visible"
          onClick={() => setDropdown(null)}
        >

          {/* Additional images strip */}
          {additionalImages.length > 0 && (
            <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
              {additionalImages.map((img, idx) => (
                <div key={idx} className="relative group/img shrink-0">
                  <img src={img} className="w-8 h-8 rounded-full object-cover border border-white/10" alt="" />
                  <button
                    onClick={() => setAdditionalImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-black/80 rounded-full flex items-center justify-center border border-white/10 opacity-0 group-hover/img:opacity-100 transition-opacity text-white"
                  >
                    <CloseIcon size={7} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-stretch">

            {/* Left: Product / App mode tabs */}
            <div className="flex flex-col gap-0 border-r border-white/[0.05] p-2 justify-center shrink-0">
              {[
                { id: "product", label: "Product", icon: <ProductShapeIcon /> },
                { id: "app",     label: "App",     icon: <AppIcon /> },
              ].map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => setAdMode(id)}
                  className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl transition-all text-[8px] font-bold uppercase tracking-wide ${
                    adMode === id ? "bg-white/[0.07] text-white" : "text-white/20 hover:text-white/45 hover:bg-white/[0.03]"
                  }`}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Center: textarea + chips */}
            <div className="flex-1 flex flex-col min-w-0 py-3 pr-3 pl-2 gap-2.5">

              {/* Input row */}
              <div className="flex items-start gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); addlInputRef.current?.click(); }}
                  className="mt-1.5 w-7 h-7 rounded-lg border border-white/[0.06] bg-white/[0.02] text-white/30 hover:text-white hover:border-white/20 hover:bg-white/[0.06] flex items-center justify-center shrink-0 transition-all"
                >
                  <PlusIcon size={13} />
                </button>
                <input ref={addlInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e, "additional")} />

                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }}
                  placeholder="Describe what happens in the ad..."
                  rows={1}
                  className="flex-1 bg-transparent border-none text-white text-sm placeholder:text-white/20 focus:outline-none resize-none leading-relaxed min-h-[36px] max-h-[200px] ms-scroll font-medium pt-1"
                />
              </div>

              {/* Chips row */}
              <div className="flex items-center justify-between gap-2 overflow-x-auto ms-scroll -mx-1 px-1">

                {/* Left chips */}
                <div className="flex items-center gap-1.5 shrink-0">

                  {/* Format */}
                  <div className="relative">
                    <Chip
                      icon={<VideoIcon />}
                      label={params.format}
                      active={dropdown === "format"}
                      onClick={(e) => openDropdown("format", e)}
                      hasDropdown
                    />
                    <FormatPicker
                      isOpen={dropdown === "format"}
                      items={ASSETS.ugc}
                      selectedId={params.format}
                      onSelect={(item) => setParams({ ...params, format: item.name, videoUrl: item.url })}
                      onClose={() => setDropdown(null)}
                    />
                  </div>

                  {/* Ratio */}
                  <div className="relative">
                    <Chip
                      icon={<PhoneIcon />}
                      label={params.ratio}
                      active={dropdown === "ratio"}
                      onClick={(e) => openDropdown("ratio", e)}
                      hasDropdown
                    />
                    <SimpleChipDropdown
                      isOpen={dropdown === "ratio"}
                      title="Aspect Ratio"
                      options={OPTIONS.ratio}
                      selected={params.ratio}
                      onSelect={(v) => setParams({ ...params, ratio: v })}
                      onClose={() => setDropdown(null)}
                    />
                  </div>

                  {/* Resolution */}
                  <div className="relative">
                    <Chip
                      icon={<QualityIcon />}
                      label={params.res}
                      active={dropdown === "res"}
                      onClick={(e) => openDropdown("res", e)}
                      hasDropdown
                    />
                    <SimpleChipDropdown
                      isOpen={dropdown === "res"}
                      title="Resolution"
                      options={OPTIONS.res}
                      selected={params.res}
                      onSelect={(v) => setParams({ ...params, res: v })}
                      onClose={() => setDropdown(null)}
                    />
                  </div>

                  {/* Duration */}
                  <div className="relative">
                    <Chip
                      icon={<ClockIcon />}
                      label={`${params.duration}s`}
                      active={dropdown === "duration"}
                      onClick={(e) => openDropdown("duration", e)}
                      hasDropdown
                    />
                    <SimpleChipDropdown
                      isOpen={dropdown === "duration"}
                      title="Duration"
                      options={OPTIONS.duration}
                      selected={params.duration}
                      onSelect={(v) => setParams({ ...params, duration: v })}
                      onClose={() => setDropdown(null)}
                      renderLabel={(v) => `${v}s`}
                    />
                  </div>

                  {/* Model */}
                  <div className="relative">
                    <Chip
                      icon={<SparkleIcon />}
                      label={selectedModel.label}
                      active={dropdown === "model"}
                      onClick={(e) => openDropdown("model", e)}
                      hasDropdown
                    />
                    <ChipDropdown
                      isOpen={dropdown === "model"}
                      title="Model"
                      onClose={() => setDropdown(null)}
                    >
                      {MODELS.map(m => (
                        <button
                          key={m.id}
                          onClick={() => { setModel(m.id); setDropdown(null); }}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between gap-2 transition-all ${
                            model === m.id ? "bg-primary/10 text-primary" : "text-white/50 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="truncate">{m.name}</span>
                          </div>
                          {model === m.id && <CheckIcon />}
                        </button>
                      ))}
                    </ChipDropdown>
                  </div>
                </div>

                {/* Right: Upload buttons + Generate */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Hidden file inputs */}
                  <input ref={productInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, "product")} />
                  <input ref={avatarInputRef}  type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, "avatar")} />

                  {/* Product upload */}
                  <button
                    onClick={(e) => { e.stopPropagation(); productInputRef.current?.click(); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all ${
                      productImage ? "border-primary/40 bg-primary/5 text-primary" : "border-white/[0.06] text-white/35 hover:border-white/15 hover:text-white/70 hover:bg-white/[0.04]"
                    }`}
                  >
                    {productImage ? (
                      <img src={productImage} className="w-4 h-4 rounded-full object-cover" alt="product" />
                    ) : (
                      <PlusIcon size={11} />
                    )}
                    <span>Product</span>
                    {productImage && (
                      <span
                        onClick={(e) => { e.stopPropagation(); setProductImage(null); }}
                        className="opacity-40 hover:opacity-100 transition-opacity ml-0.5"
                      >
                        <CloseIcon size={8} />
                      </span>
                    )}
                  </button>

                  {/* Avatar upload / picker */}
                  <div className="relative">
                    <button
                      onClick={(e) => openDropdown("avatar", e)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all ${
                        avatarImage ? "border-primary/40 bg-primary/5 text-primary" : "border-white/[0.06] text-white/35 hover:border-white/15 hover:text-white/70 hover:bg-white/[0.04]"
                      }`}
                    >
                      {avatarImage ? (
                        <img src={avatarImage} className="w-4 h-4 rounded-full object-cover" alt="avatar" />
                      ) : (
                        <PlusIcon size={11} />
                      )}
                      <span>Avatar</span>
                      {avatarImage && (
                        <span
                          onClick={(e) => { e.stopPropagation(); setAvatarImage(null); }}
                          className="opacity-40 hover:opacity-100 transition-opacity ml-0.5"
                        >
                          <CloseIcon size={8} />
                        </span>
                      )}
                    </button>
                    <AvatarPicker
                      isOpen={dropdown === "avatar"}
                      items={ASSETS.avatar}
                      selectedId={avatarImage}
                      onSelect={(item) => setAvatarImage(item.url)}
                      onClose={() => setDropdown(null)}
                    />
                  </div>

                  {/* Generate */}
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-50 bg-primary text-black hover:brightness-110 active:scale-[0.97]"
                    style={{ boxShadow: "0 0 18px rgba(255,69,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)" }}
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                        <span>Generating</span>
                      </>
                    ) : (
                      <>
                        <span>Generate</span>
                        <span className="opacity-60 border-l border-black/15 pl-2 font-bold text-[10px]">+{cost}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Fullscreen ── */}
      {fullscreenUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={() => setFullscreenUrl(null)}
        >
          <button className="absolute top-5 right-5 p-2.5 bg-white/10 hover:bg-white/20 rounded-full border border-white/10 text-white transition-colors">
            <CloseIcon size={14} />
          </button>
          <video
            src={fullscreenUrl}
            controls autoPlay
            className="max-w-[95vw] max-h-[92vh] rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
