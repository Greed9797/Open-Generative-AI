'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Images, FilmSlate, Scissors, Sparkle, Microphone,
  FilmReel, Megaphone, GitFork, GearSix,
  UploadSimple, List,
} from '@phosphor-icons/react';
import {
  ImageStudio, ImageAgentStudio, VideoStudio, VideoEditorStudio, LipSyncStudio,
  CinemaStudio, MarketingStudio, WorkflowStudio, AgentStudio,
  JobsCRM, LoraStudio,
} from 'studio';
import SettingsPanel from './SettingsPanel';
import { createClient } from '@/lib/supabase/client';

// ─── Nav config ──────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'image',     label: 'Image Studio',     Icon: Images     },
  { id: 'image-agent', label: 'Image Agent',    Icon: Sparkle    },
  { id: 'video',     label: 'Video Studio',     Icon: FilmSlate  },
  { id: 'editor',    label: 'Video Editor',     Icon: Scissors   },
  { id: 'agent',     label: 'Agent Studio',     Icon: Sparkle    },
  { id: 'jobs',      label: 'Jobs',             Icon: List       },
  { id: 'lipsync',   label: 'Lip Sync',         Icon: Microphone },
  { id: 'cinema',    label: 'Cinema Studio',    Icon: FilmReel   },
  { id: 'marketing', label: 'Marketing Studio', Icon: Megaphone  },
  { id: 'workflow',  label: 'Workflows',        Icon: GitFork    },
  { id: 'lora',      label: 'LoRA Studio',      Icon: Sparkle    },
];

const ALL_TABS = [
  ...NAV_ITEMS,
  { id: 'settings', label: 'Settings', Icon: GearSix },
];

const TAB_ALIASES = {
  workflows: 'workflow',
  agents: 'agent',
};

function normalizeTab(tab) {
  return TAB_ALIASES[tab] || tab;
}

function readStoredKey(name) {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(name) || '';
}

// ─── Motion helpers ───────────────────────────────────────────────────────────

const contentVariants = {
  enter: (shouldReduce) => ({
    opacity: 0,
    y: shouldReduce ? 0 : 5,
  }),
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.09 },
  },
};

const mobileMenuVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 360, damping: 32 },
  },
  exit: {
    opacity: 0, y: 12, scale: 0.97,
    transition: { duration: 0.12 },
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function VboLogo() {
  return (
    <div className="flex items-center gap-2 select-none flex-shrink-0">
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--primary)' }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      <span className="text-[13px] font-semibold tracking-tight hidden sm:block" style={{ color: 'var(--text-1)' }}>
        VBO<span style={{ color: 'var(--primary)' }}>.AI</span>
      </span>
    </div>
  );
}

function DragOverlay() {
  return (
    <motion.div
      key="drag-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(8px)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      <motion.div
        className="flex flex-col items-center gap-4 rounded-2xl px-12 py-10"
        style={{
          border: '2px dashed var(--glass-border)',
          background: 'rgba(255,69,0,0.04)',
        }}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        <UploadSimple size={36} weight="thin" style={{ color: 'var(--primary)' }} />
        <div className="text-center">
          <p className="font-semibold text-[15px]" style={{ color: 'var(--text-1)' }}>
            Soltar arquivo aqui
          </p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>
            Imagens, vídeos e áudios são aceitos
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MobileMenu({ activeTab, onTabChange, onClose }) {
  const settingsTab = { id: 'settings', label: 'Config', Icon: GearSix };
  const allItems = [...NAV_ITEMS, settingsTab];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 pb-8"
        style={{
          background: 'var(--bg-panel)',
          borderTop: '1px solid var(--border)',
        }}
        variants={mobileMenuVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'var(--border)' }} />

        {/* Grid of tabs */}
        <div className="grid grid-cols-3 gap-2">
          {allItems.map((tab) => {
            const { Icon } = tab;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="flex flex-col items-center gap-2 py-3 px-2 rounded-xl transition-colors"
                style={{
                  background: isActive ? 'rgba(255,69,0,0.10)' : 'var(--bg-card)',
                  border: `1px solid ${isActive ? 'rgba(255,69,0,0.30)' : 'var(--border)'}`,
                  color: isActive ? 'var(--primary)' : 'var(--text-2)',
                }}
              >
                <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                <span className="text-[11px] font-medium leading-tight text-center">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}

// ─── Main Shell ───────────────────────────────────────────────────────────────

export default function StandaloneShell() {
  const params  = useParams();
  const router  = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();

  const slug          = params?.slug || [];
  const idFromParams  = params?.id;
  const tabFromParams = params?.tab;

  const getWorkflowInfo = useCallback(() => {
    if (idFromParams) return { id: idFromParams, tab: tabFromParams || null };
    const wfIndex = slug.findIndex(s => s === 'workflows' || s === 'workflow');
    if (wfIndex === -1) return { id: null, tab: null };
    return { id: slug[wfIndex + 1] || null, tab: slug[wfIndex + 2] || null };
  }, [slug, idFromParams, tabFromParams]);

  const { id: urlWorkflowId } = getWorkflowInfo();

  const getInitialTab = () => {
    const queryTab = normalizeTab(searchParams.get('tab'));
    if (queryTab && ALL_TABS.find(t => t.id === queryTab)) return queryTab;
    if (idFromParams || slug.includes('workflow') || slug.includes('workflows')) return 'workflow';
    if (slug.includes('agents')) return 'agent';
    const first = slug[0];
    const normalized = normalizeTab(first);
    if (normalized && ALL_TABS.find(t => t.id === normalized)) return normalized;
    return 'image';
  };

  const [activeTab,        setActiveTab]        = useState(getInitialTab);
  const [hasMounted,       setHasMounted]       = useState(false);
  const [isDragging,       setIsDragging]       = useState(false);
  const [droppedFiles,     setDroppedFiles]     = useState(null);
  const [isHeaderVisible,  setIsHeaderVisible]  = useState(true);
  const [mobileMenuOpen,   setMobileMenuOpen]   = useState(false);
  const [minimaxApiKey,    setMinimaxApiKey]    = useState(() => readStoredKey('minimax_api_key'));
  const [geminiApiKey,     setGeminiApiKey]     = useState(() => readStoredKey('gemini_api_key'));

  // Sync tab with URL
  useEffect(() => {
    const queryTab = normalizeTab(searchParams.get('tab'));
    if (queryTab && ALL_TABS.find(t => t.id === queryTab)) {
      setActiveTab(queryTab);
      return;
    }
    const info = getWorkflowInfo();
    if (info.id) {
      setActiveTab('workflow');
    } else if (slug.includes('agents')) {
      setActiveTab('agent');
    } else {
      const first = normalizeTab(slug[0]);
      if (first && ALL_TABS.find(t => t.id === first)) setActiveTab(first);
    }
  }, [slug, getWorkflowInfo, searchParams]);

  // Hide header inside workflow editor
  useEffect(() => {
    const editing = (activeTab === 'workflow' || !!idFromParams) && urlWorkflowId;
    setIsHeaderVisible(!editing);
  }, [activeTab, urlWorkflowId, idFromParams]);

  // Global CSS cleanup when leaving workflow builder
  useEffect(() => {
    const from = sessionStorage.getItem('fromWorkflowBuilder');
    if (from && activeTab !== 'workflow') {
      sessionStorage.removeItem('fromWorkflowBuilder');
      window.location.reload();
    }
  }, [activeTab]);

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem('creativeos_supabase_session');
    window.location.href = '/';
  }, []);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const onStorage = () => {
      setMinimaxApiKey(readStoredKey('minimax_api_key'));
      setGeminiApiKey(readStoredKey('gemini_api_key'));
    };
    const onAddToEditor = (event) => {
      try {
        const current = JSON.parse(localStorage.getItem('video_editor_pending_clips') || '[]');
        const detail = event.detail || {};
        const clip = {
          id: detail.id || `clip-${Date.now()}`,
          url: detail.url || detail.clipUrl || detail.videoUrl,
          duration: detail.duration || 8,
          label: detail.label || 'Clip',
        };
        if (clip.url) {
          localStorage.setItem('video_editor_pending_clips', JSON.stringify([...current, clip]));
          setActiveTab('editor');
          router.push('/studio?tab=editor', { scroll: false });
        }
      } catch {
        /* ignore malformed clip events */
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('add-to-editor', onAddToEditor);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('add-to-editor', onAddToEditor);
    };
  }, [router]);

  const handleTabChange = useCallback((tabId) => {
    const nextTab = normalizeTab(tabId);
    setActiveTab(nextTab);
    setMobileMenuOpen(false);
    router.push(`/studio?tab=${nextTab}`, { scroll: false });
  }, [router]);

  const handleFilesHandled = useCallback(() => setDroppedFiles(null), []);

  // Drag & Drop
  const handleDragOver  = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDragEnter = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer.items?.length > 0) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false);
  }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) setDroppedFiles(files);
  }, []);

  if (!hasMounted) return null;

  return (
    <div
      className="flex flex-col min-h-[100dvh] overflow-hidden relative"
      style={{ background: 'var(--bg-app)' }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && <DragOverlay />}
      </AnimatePresence>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <MobileMenu
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onClose={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Top navbar ── */}
      {isHeaderVisible && (
        <header className="navbar flex-shrink-0">
          {/* Logo */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <VboLogo />
          </div>

          {/* Desktop nav links */}
          <nav
            className="hidden md:flex items-center gap-1 flex-1 px-4 overflow-x-auto"
            style={{ scrollbarWidth: 'none', whiteSpace: 'nowrap' }}
          >
            {NAV_ITEMS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`nav-item${isActive ? ' active' : ''}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {/* Settings — desktop */}
            <button
              onClick={() => handleTabChange('settings')}
              className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
              style={{
                color: activeTab === 'settings' ? 'var(--primary)' : 'var(--text-2)',
                background: activeTab === 'settings' ? 'rgba(255,69,0,0.10)' : 'transparent',
              }}
              aria-label="Configurações"
            >
              <GearSix size={17} weight={activeTab === 'settings' ? 'fill' : 'regular'} />
            </button>

            <button
              onClick={handleLogout}
              className="hidden md:flex items-center justify-center rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors"
              style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              Sair
            </button>

            {/* Hamburger — mobile */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex md:hidden items-center justify-center w-8 h-8 rounded-lg"
              style={{ color: 'var(--text-2)' }}
              aria-label="Abrir menu"
            >
              <List size={18} />
            </button>
          </div>
        </header>
      )}

      {/* ── Studio content ── */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            className="absolute inset-0"
            variants={contentVariants}
            custom={shouldReduceMotion}
            initial="enter"
            animate="visible"
            exit="exit"
          >
            {activeTab === 'image'     && <ImageStudio      droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} />}
            {activeTab === 'image-agent' && <ImageAgentStudio minimaxApiKey={minimaxApiKey} geminiApiKey={geminiApiKey} />}
            {activeTab === 'video'     && <VideoStudio      droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} />}
            {activeTab === 'editor'    && <VideoEditorStudio />}
            {activeTab === 'agent'     && <AgentStudio      minimaxApiKey={minimaxApiKey} geminiApiKey={geminiApiKey} isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />}
            {activeTab === 'jobs'      && <JobsCRM          minimaxApiKey={minimaxApiKey} geminiApiKey={geminiApiKey} />}
            {activeTab === 'lipsync'   && <LipSyncStudio    droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} />}
            {activeTab === 'cinema'    && <CinemaStudio />}
            {activeTab === 'marketing' && <MarketingStudio  droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} />}
            {activeTab === 'workflow'  && <WorkflowStudio   isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />}
            {activeTab === 'lora'      && <LoraStudio />}
            {activeTab === 'settings'  && <SettingsPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
