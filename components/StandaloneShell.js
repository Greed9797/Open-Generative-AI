'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ImageStudio, VideoStudio, VideoEditorStudio, LipSyncStudio, CinemaStudio, MarketingStudio, WorkflowStudio, AgentStudio } from 'studio';
import SettingsPanel from './SettingsPanel';

const TABS = [
  { id: 'image',   label: 'Estúdio de Imagem' },
  { id: 'video',   label: 'Estúdio de Vídeo' },
  { id: 'editor', label: 'Editor de Vídeo', icon: '✂️' },
  { id: 'agent', label: 'Estúdio de Agentes', icon: '🤖' },
  { id: 'lipsync', label: 'Sincronização Labial' },
  { id: 'cinema',  label: 'Estúdio Cinema' },
  { id: 'marketing', label: 'Estúdio de Marketing' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'agents', label: 'Agentes' },
  { id: 'settings', label: 'Configurações', icon: '⚙️' },
];

export default function StandaloneShell() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug || [];
  const idFromParams = params?.id;
  const tabFromParams = params?.tab;

  // Helper to extract workflow details precisely from either route structure
  const getWorkflowInfo = useCallback(() => {
    if (idFromParams) {
        return { id: idFromParams, tab: tabFromParams || null };
    }
    const wfIndex = slug.findIndex(s => s === 'workflows' || s === 'workflow');
    if (wfIndex === -1) return { id: null, tab: null };
    return {
      id: slug[wfIndex + 1] || null,
      tab: slug[wfIndex + 2] || null
    };
  }, [slug, idFromParams, tabFromParams]);

  const { id: urlWorkflowId } = getWorkflowInfo();

  // Initialize activeTab from URL slug/params or default to 'image'
  const getInitialTab = () => {
    if (idFromParams || slug.includes('workflow')) return 'workflows';
    if (slug.includes('agents')) return 'agents';
    const firstSegment = slug[0];
    if (firstSegment && TABS.find(t => t.id === firstSegment)) return firstSegment;
    return 'image';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [showSettings, setShowSettings] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  // Drag and Drop State
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState(null);

  // Sync tab with URL if user navigates manually or via browser back/forward
  useEffect(() => {
    const info = getWorkflowInfo();
    if (info.id) {
        setActiveTab('workflows');
    } else if (slug.includes('agents')) {
        setActiveTab('agents');
    } else {
        const firstSegment = slug[0];
        if (firstSegment && TABS.find(t => t.id === firstSegment)) {
          setActiveTab(firstSegment);
        }
    }
  }, [slug, getWorkflowInfo]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    router.push(`/studio/${tabId}`);
  };

  // Auto-hide header when inside a specific workflow view
  useEffect(() => {
    const isEditingWorkflow = (activeTab === 'workflows' || !!idFromParams) && urlWorkflowId;
    if (isEditingWorkflow) {
      setIsHeaderVisible(false);
    } else {
      setIsHeaderVisible(true);
    }
  }, [activeTab, urlWorkflowId, idFromParams]);

  // Global builder CSS cleanup when switching away from Workflows tab
  useEffect(() => {
    const fromBuilder = sessionStorage.getItem("fromWorkflowBuilder");
    if (fromBuilder && activeTab !== 'workflows') {
      sessionStorage.removeItem("fromWorkflowBuilder");
      window.location.reload();
    }
  }, [activeTab]);

  const handleKeyChange = useCallback(() => {
    ['muapi_key','image_api_key','video_api_key','minimax_api_key','gemini_api_key','creativeos_supabase_session'].forEach(k => localStorage.removeItem(k));
    document.cookie = "muapi_key=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }, []);

  useEffect(() => {
    handleKeyChange();
    setHasMounted(true);
  }, [handleKeyChange]);

  // Drag and Drop Handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container itself, not moving between children
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setDroppedFiles(files);
    }
  }, []);

  const handleFilesHandled = useCallback(() => {
    setDroppedFiles(null);
  }, []);

  if (!hasMounted) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="animate-spin text-[#FF4500] text-3xl">◌</div>
    </div>
  );

  return (
    <div
      className="h-screen bg-[#030303] flex flex-col overflow-hidden text-white relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] bg-[#FF4500]/10 backdrop-blur-md border-4 border-dashed border-[#FF4500]/50 flex items-center justify-center pointer-events-none transition-all duration-300">
          <div className="bg-[#0a0a0a] p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center gap-4 scale-110 animate-pulse">
            <div className="w-20 h-20 bg-[#FF4500] rounded-2xl flex items-center justify-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xl font-bold text-white">Solte sua mídia aqui</span>
              <span className="text-sm text-white/40">Imagens, vídeos ou arquivos de áudio</span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      {isHeaderVisible && (
        <header className="flex-shrink-0 h-14 border-b border-white/[0.03] flex items-center px-4 bg-black/20 backdrop-blur-md z-40 gap-3">
          {/* Left: Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <span className="text-sm font-bold tracking-tight hidden sm:block">VBO.AI</span>
          </div>

          {/* Center: Navigation — scrollable on small screens */}
          <nav
            className="flex-1 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="flex items-center gap-6 px-2 min-w-max mx-auto w-fit">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`relative py-4 text-[13px] font-medium transition-all whitespace-nowrap px-1 ${
                    activeTab === tab.id
                      ? 'text-[#FF4500]'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  {tab.icon ? `${tab.icon} ${tab.label}` : tab.label}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF4500] rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF4500] to-yellow-200 border border-white/20 cursor-pointer hover:scale-105 transition-transform"
            />
          </div>
        </header>
      )}

      {/* Studio Content */}
      <div className="flex-1 min-h-0 min-w-0 relative overflow-hidden">
        {activeTab === 'image'   && <ImageStudio   droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} />}
        {activeTab === 'video'   && <VideoStudio   droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} />}
        {activeTab === 'editor'  && <VideoEditorStudio />}
        {activeTab === 'agent' && <AgentStudio />}
        {activeTab === 'lipsync' && <LipSyncStudio droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} />}
        {activeTab === 'cinema'  && <CinemaStudio  />}
        {activeTab === 'marketing' && <MarketingStudio droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} />}
        {activeTab === 'workflows' && <WorkflowStudio isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />}
        {activeTab === 'agents' && <AgentStudio isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />}
        {activeTab === 'settings' && <SettingsPanel />}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-8 w-full max-w-sm shadow-2xl">
            <h2 className="text-white font-bold text-lg mb-2">Configurações</h2>
            <p className="text-white/40 text-[13px] mb-8">
              Gerencie suas preferências do estúdio de IA e autenticação.
            </p>

            <div className="mb-8">
              <div className="bg-white/5 border border-white/[0.03] rounded-md p-4 text-center">
                <p className="text-sm text-white/60">Gerencie suas chaves de API em</p>
                <button
                  onClick={() => { setShowSettings(false); handleTabChange('settings'); }}
                  className="mt-2 text-sm text-[#FF4500] hover:underline font-medium"
                >
                  Configurações → Chaves de API
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleKeyChange}
                className="flex-1 h-10 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-all"
              >
                Limpar Chaves
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 h-10 rounded-md bg-white/5 text-white/80 hover:bg-white/10 text-xs font-semibold transition-all border border-white/5"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
