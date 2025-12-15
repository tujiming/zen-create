import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from './components/Layout';
import { Player } from './components/Player';
import { Project, Scene, AVAILABLE_VOICES } from './types';
import { generateScript, parseUserScript, generateSceneAudio, generateSceneVideo, generateSceneImage } from './services/geminiService';
import { saveProjectToStorage, getProjectsFromStorage, deleteProjectFromStorage } from './services/storageService';

type InputMode = 'TOPIC' | 'SCRIPT';

const App: React.FC = () => {
  const [project, setProject] = useState<Project | null>(null);
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);
  const [isBusy, setIsBusy] = useState(false); 
  const [autoProgress, setAutoProgress] = useState<{ current: number; total: number; status: string } | null>(null);
  
  // Input States
  const [inputMode, setInputMode] = useState<InputMode>('TOPIC');
  const [inputTopic, setInputTopic] = useState('');
  const [inputScript, setInputScript] = useState('');
  
  // Consistency Inputs
  const [characterDesc, setCharacterDesc] = useState('An 8-year-old cute buddhist novice monk, wearing grey robes, shaved head, kind smile');
  const [artStyle, setArtStyle] = useState('Ghibli style animation, soft lighting, peaceful atmosphere');

  const [targetAudience, setTargetAudience] = useState('Children');
  const [selectedVoice, setSelectedVoice] = useState(AVAILABLE_VOICES[0].name);
  const [targetDuration, setTargetDuration] = useState(1); 
  
  const [showPlayer, setShowPlayer] = useState(false);

  // --- Init ---
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    const history = getProjectsFromStorage();
    setSavedProjects(history);
  };

  // --- Helpers ---
  const ensureApiKey = async () => {
    // 1. First check if we are in the AI Studio / Project IDX environment
    if ((window as any).aistudio) {
      try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await (window as any).aistudio.openSelectKey();
        }
        return true;
      } catch (e) {
        console.error("Key selection error", e);
        return false;
      }
    }
    
    // 2. If not, check if API_KEY is set in environment variables (for deployed apps)
    if (process.env.API_KEY) {
        return true;
    }

    return false;
  };

  const checkApiKeyBeforeAction = async (): Promise<boolean> => {
      const ready = await ensureApiKey();
      const currentKey = process.env.API_KEY;
      
      if (!ready && !currentKey) {
          alert("⚠️ 未检测到 API Key\n\n如果您已部署此应用，请在托管平台（如 Vercel/Netlify）的设置中添加环境变量 'API_KEY'。\n\n如果是本地运行，请确保您已连接到 Google AI Studio。");
          return false;
      }
      return true;
  };

  // Helper to remove "isGenerating" flags that might be stuck from a previous session
  const cleanupProjectState = (p: Project): Project => ({
    ...p,
    scenes: p.scenes.map(s => ({
        ...s,
        isGeneratingAudio: false,
        isGeneratingVideo: false,
        isGeneratingImage: false
    }))
  });

  const handleSelectProject = (p: Project) => {
    setProject(cleanupProjectState(p));
  };

  // Save current project state to local storage wrapper
  const persistProject = (proj: Project) => {
    saveProjectToStorage(proj);
    setProject(proj);
    loadHistory(); // Refresh list
  };

  const updateSceneStatus = (sceneId: string, updates: Partial<Scene>) => {
    setProject(prev => {
      if (!prev) return null;
      const updatedScenes = prev.scenes.map(s => s.id === sceneId ? { ...s, ...updates } : s);
      const updatedProject = { ...prev, scenes: updatedScenes };
      // Save on significant status updates
      if (updates.audioUrl || updates.videoUrl || updates.imageUrl) {
         saveProjectToStorage(updatedProject);
         loadHistory();
      }
      return updatedProject;
    });
  };

  const getAudienceLabel = (aud: string) => {
    switch(aud) {
      case 'Children': return '儿童 (Children)';
      case 'General': return '大众 (General)';
      case 'Elderly': return '长者 (Elderly)';
      default: return aud;
    }
  };

  const getVoiceLabel = (voice: typeof AVAILABLE_VOICES[0]) => {
     const gender = voice.gender === 'Male' ? '男声' : '女声';
     const style = voice.style;
     return `${voice.name} - ${gender} (${style})`;
  };

  const getDurationLabel = (min: number) => {
      // Updated to reflect 5s per scene density
      const scenes = Math.ceil((min * 60) / 5);
      return `${min} 分钟 (约 ${scenes} 个分镜)`;
  };

  const handleDeleteProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(confirm('确定要删除这个作品吗？')) {
      const updated = deleteProjectFromStorage(id);
      setSavedProjects(updated);
    }
  };

  // --- Export / Import Functions ---

  const handleExportProject = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(p));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `${p.title || 'ZenProject'}_${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (err) {
      console.error(err);
      alert("导出失败");
    }
  };

  const handleImportProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        // Basic Validation
        if (!json.scenes || !Array.isArray(json.scenes)) {
          alert("文件格式错误：这不是一个有效的 ZenCreate 项目文件。");
          return;
        }

        // Create a new ID to avoid collisions, but keep content
        const newProject: Project = {
          ...json,
          id: `proj-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          updatedAt: Date.now()
        };

        saveProjectToStorage(newProject);
        loadHistory();
        alert(`成功导入作品："${newProject.title}"`);
      } catch (err) {
        console.error(err);
        alert("导入失败：文件解析错误。");
      }
    };
    reader.readAsText(file);
    // Reset value to allow re-importing same file
    e.target.value = '';
  };

  // --- Automation Workflow ---

  // STEP 1: Generate Script (Either from Topic or Raw Text)
  const handleCreateScript = async () => {
    if (inputMode === 'TOPIC' && !inputTopic) return;
    if (inputMode === 'SCRIPT' && !inputScript) return;
    
    if (!(await checkApiKeyBeforeAction())) return;
    const currentApiKey = process.env.API_KEY || '';

    setIsBusy(true);
    const modeLabel = inputMode === 'TOPIC' ? '正在构思脚本' : '正在分析文案';
    setAutoProgress({ current: 0, total: 1, status: `${modeLabel} (Processing Script)...` });

    try {
      let result;
      if (inputMode === 'TOPIC') {
         result = await generateScript(inputTopic, targetAudience, targetDuration, characterDesc, artStyle, currentApiKey);
      } else {
         result = await parseUserScript(inputScript, characterDesc, artStyle, currentApiKey);
      }
      
      const newScenes: Scene[] = result.scenes.map((s, idx) => ({
        id: `scene-${idx}-${Date.now()}`,
        narration: s.narration,
        visualPrompt: s.visualDescription,
        isGeneratingImage: false,
        isGeneratingVideo: false,
        isGeneratingAudio: false,
      }));

      const newProject: Project = {
        id: `proj-${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        title: result.title,
        targetAudience: targetAudience as any,
        coreValue: 'Compassion',
        globalCharacter: characterDesc,
        globalStyle: artStyle,
        scenes: newScenes
      };
      
      persistProject(newProject);
      
      setAutoProgress(null);
      // We stop here to let user edit.

    } catch (error) {
      console.error(error);
      alert("脚本处理失败，请检查网络或 API Key 设置。");
      setAutoProgress(null);
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * STEP 2 & 3: Production Phase
   */
  const handleStartProduction = async () => {
    if (!project) return;

    if (!(await checkApiKeyBeforeAction())) return;
    const currentApiKey = process.env.API_KEY || '';
    
    setIsBusy(true);
    
    const audioTasks = project.scenes.filter(s => !s.audioUrl);
    const visualTasks = project.scenes.filter(s => !s.videoUrl && !s.imageUrl);
    
    const totalSteps = audioTasks.length + visualTasks.length;
    let currentStep = 0;
    
    let failedCount = 0;
    let lastError = '';
    let videoQuotaExhausted = false; 
    
    // --- PHASE 1: AUDIO GENERATION ---
    for (let i = 0; i < audioTasks.length; i++) {
        const s = audioTasks[i];
        const sceneId = s.id;
        const sceneNum = project.scenes.findIndex(sc => sc.id === s.id) + 1;

        currentStep++;
        setAutoProgress({ current: currentStep, total: totalSteps, status: `[1/2 配音制作] 场景 ${sceneNum}...` });
        updateSceneStatus(sceneId, { isGeneratingAudio: true });

        try {
             if (i > 0) await new Promise(r => setTimeout(r, 500));
             const res = await generateSceneAudio(s.narration, selectedVoice, currentApiKey);
             updateSceneStatus(sceneId, { audioUrl: res.url, audioDuration: res.duration, isGeneratingAudio: false });
        } catch(e: any) {
             console.error("Audio Failed", e);
             lastError = e.message || 'Unknown Audio Error';
             updateSceneStatus(sceneId, { isGeneratingAudio: false });
             failedCount++;
        }
    }

    // --- PHASE 2: VISUAL GENERATION ---
    for (let i = 0; i < visualTasks.length; i++) {
       const s = visualTasks[i];
       const sceneId = s.id;
       const sceneNum = project.scenes.findIndex(sc => sc.id === s.id) + 1;
       
       currentStep++;
       setAutoProgress({ current: currentStep, total: totalSteps, status: `[2/2 视频制作] 场景 ${sceneNum}...` });
       updateSceneStatus(sceneId, { isGeneratingVideo: true });

       if (videoQuotaExhausted) {
          // Direct Image Fallback
          try {
              await new Promise(r => setTimeout(r, 1000));
              const imgUrl = await generateSceneImage(s.visualPrompt, currentApiKey);
              updateSceneStatus(sceneId, { imageUrl: imgUrl, isGeneratingVideo: false });
          } catch (imgE: any) {
              failedCount++;
              updateSceneStatus(sceneId, { isGeneratingVideo: false });
          }
       } else {
          // Try Video
          try {
             if (i > 0) await new Promise(r => setTimeout(r, 4000));
             const url = await generateSceneVideo(s.visualPrompt, currentApiKey);
             updateSceneStatus(sceneId, { videoUrl: url, isGeneratingVideo: false });
          } catch(e: any) {
             const errStr = (e.message || '') + JSON.stringify(e);
             if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
                 console.warn("Veo Quota Exhausted during fix. Switching to Image.");
                 videoQuotaExhausted = true;
             }
             
             console.warn("Fix Video Failed, trying Image fallback...");
             try {
                const imgUrl = await generateSceneImage(s.visualPrompt, currentApiKey);
                updateSceneStatus(sceneId, { imageUrl: imgUrl, isGeneratingVideo: false });
             } catch(imgE: any) {
                lastError = imgE.message || 'Unknown Visual Error';
                updateSceneStatus(sceneId, { isGeneratingVideo: false });
                failedCount++;
             }
          }
       }
    }

    setIsBusy(false);
    setAutoProgress(null);
    
    if (failedCount > 0) {
        alert(`生成结束，但仍有 ${failedCount} 个项目失败。\n\n原因: ${lastError}\n\n建议稍作休息后再试，或使用“生成图片”代替视频。`);
    } else {
        // All good, auto play
        setShowPlayer(true);
    }
  };

  // --- Manual Actions ---

  const handleManualAction = async (sceneId: string, type: 'AUDIO' | 'VIDEO' | 'IMAGE') => {
    if (!project) return;
    
    if (type !== 'AUDIO') {
        if (!(await checkApiKeyBeforeAction())) return;
    }
    const currentApiKey = process.env.API_KEY || '';

    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    try {
      if (type === 'AUDIO') {
        updateSceneStatus(sceneId, { isGeneratingAudio: true });
        const res = await generateSceneAudio(scene.narration, selectedVoice, currentApiKey);
        updateSceneStatus(sceneId, { audioUrl: res.url, audioDuration: res.duration, isGeneratingAudio: false });
      } 
      else if (type === 'VIDEO') {
        updateSceneStatus(sceneId, { isGeneratingVideo: true });
        try {
           const url = await generateSceneVideo(scene.visualPrompt, currentApiKey);
           updateSceneStatus(sceneId, { videoUrl: url, isGeneratingVideo: false });
        } catch (e: any) {
           const errStr = (e.message || '') + JSON.stringify(e);
           const isQuota = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED');
           
           const msg = isQuota 
              ? "视频生成配额已用完 (Quota Exceeded)。\n\n是否切换为生成图片？" 
              : "视频生成失败。\n\n是否尝试生成图片代替？";

           if(confirm(msg)) {
              const imgUrl = await generateSceneImage(scene.visualPrompt, currentApiKey);
              updateSceneStatus(sceneId, { imageUrl: imgUrl, isGeneratingVideo: false });
           } else {
              throw e;
           }
        }
      }
      else if (type === 'IMAGE') {
        updateSceneStatus(sceneId, { isGeneratingImage: true });
        const url = await generateSceneImage(scene.visualPrompt, currentApiKey);
        updateSceneStatus(sceneId, { imageUrl: url, isGeneratingImage: false });
      }
    } catch (e: any) {
      console.error(e);
      alert(`${type} 生成失败: ${e.message}`);
      updateSceneStatus(sceneId, { isGeneratingAudio: false, isGeneratingVideo: false, isGeneratingImage: false });
    }
  };

  const handleUpdateText = (sceneId: string, field: 'narration' | 'visualPrompt', value: string) => {
    if (!project) return;
    const newScenes = project.scenes.map(s => s.id === sceneId ? { ...s, [field]: value } : s);
    const updatedProject = { ...project, scenes: newScenes };
    setProject(updatedProject);
    saveProjectToStorage(updatedProject);
    loadHistory();
  };

  // --- Views ---

  // 1. Loading View
  if (isBusy) {
    return (
        <Layout title="">
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="w-16 h-16 border-4 border-monk-200 border-t-monk-600 rounded-full animate-spin mb-6"></div>
                <h3 className="text-2xl font-serif text-monk-800 mb-2">正在用心制作 (Processing)</h3>
                {autoProgress && (
                    <div className="max-w-md w-full px-4">
                        <p className="text-monk-600 font-medium mb-2">{autoProgress.status}</p>
                        <div className="w-full bg-monk-100 rounded-full h-2.5">
                            <div className="bg-monk-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${(autoProgress.current / autoProgress.total) * 100}%` }}></div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
  }

  // 2. Editor View
  if (project) {
    return (
        <Layout title={project.title}>
            {showPlayer && (
                <Player scenes={project.scenes} onClose={() => setShowPlayer(false)} />
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white p-4 rounded-xl border border-monk-200 shadow-sm">
                <button onClick={() => setProject(null)} className="text-monk-500 hover:text-monk-800 flex items-center gap-2 text-sm font-bold">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    返回 (Back)
                </button>
                <div className="flex gap-3">
                    <button onClick={() => setShowPlayer(true)} className="bg-monk-600 hover:bg-monk-700 text-white px-5 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        预览 (Preview)
                    </button>
                    <button onClick={handleStartProduction} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
                        一键生成素材 (Generate All)
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                {project.scenes.map((scene, idx) => (
                    <div key={scene.id} className="bg-white rounded-xl shadow-sm border border-monk-200 overflow-hidden flex flex-col md:flex-row">
                        <div className="md:w-1/3 bg-stone-100 relative group min-h-[200px]">
                            {scene.videoUrl ? (
                                <video src={scene.videoUrl} className="w-full h-full object-cover" controls muted />
                            ) : scene.imageUrl ? (
                                <img src={scene.imageUrl} className="w-full h-full object-cover" />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-stone-300">
                                    <span className="text-sm font-bold">等待生成画面</span>
                                </div>
                            )}
                            
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                                <button onClick={() => handleManualAction(scene.id, 'VIDEO')} className="bg-white text-stone-900 text-xs font-bold px-3 py-2 rounded shadow hover:bg-stone-200">
                                    生成视频 (Veo)
                                </button>
                                <button onClick={() => handleManualAction(scene.id, 'IMAGE')} className="bg-white text-stone-900 text-xs font-bold px-3 py-2 rounded shadow hover:bg-stone-200">
                                    生成图片 (Imagen)
                                </button>
                            </div>

                            {(scene.isGeneratingVideo || scene.isGeneratingImage) && (
                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent"></div>
                                </div>
                            )}
                        </div>

                        <div className="md:w-2/3 p-6 flex flex-col gap-4">
                            <div className="flex justify-between items-start">
                                <span className="bg-monk-100 text-monk-700 text-xs font-bold px-2 py-1 rounded">Scene {idx + 1}</span>
                                <div className="flex items-center gap-2">
                                    {scene.audioUrl && <audio src={scene.audioUrl} controls className="h-6 w-32" />}
                                    <button 
                                        onClick={() => handleManualAction(scene.id, 'AUDIO')}
                                        disabled={scene.isGeneratingAudio}
                                        className="text-xs border border-monk-200 text-monk-600 px-2 py-1 rounded hover:bg-monk-50"
                                    >
                                        {scene.isGeneratingAudio ? '生成中...' : '重新配音'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] uppercase text-monk-300 font-bold tracking-wider">Narration</label>
                                <textarea 
                                    className="w-full border-l-2 border-monk-200 pl-3 py-1 text-lg font-serif text-monk-800 bg-transparent focus:outline-none resize-none"
                                    rows={2}
                                    value={scene.narration}
                                    onChange={(e) => handleUpdateText(scene.id, 'narration', e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="text-[10px] uppercase text-monk-300 font-bold tracking-wider">Visual Prompt</label>
                                <textarea 
                                    className="w-full bg-stone-50 border border-stone-200 rounded p-2 text-xs text-stone-500 focus:outline-none resize-none"
                                    rows={2}
                                    value={scene.visualPrompt}
                                    onChange={(e) => handleUpdateText(scene.id, 'visualPrompt', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="h-12"></div>
        </Layout>
    );
  }

  // 3. Create / Dashboard View
  return (
      <Layout title="">
        {/* CREATE SECTION */}
        <div className="max-w-4xl mx-auto bg-white p-8 rounded-2xl shadow-xl border border-monk-200 mb-12">
          <div className="mb-8 text-center border-b border-monk-100 pb-6">
            <h3 className="text-3xl font-serif text-monk-800 mb-2 font-bold">开始新的创作</h3>
            <p className="text-monk-600 font-light">设定人物角色与画风，可选择AI自动构思或自己输入文字。</p>
          </div>
          
          {/* 1. Consistency Settings (Crucial for Video) */}
          <div className="mb-8 bg-monk-50 p-6 rounded-xl border border-monk-200">
             <h4 className="text-lg font-bold text-monk-800 mb-4 flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                 <path fillRule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clipRule="evenodd" />
               </svg>
               角色与画风统一设定 (Consistency)
             </h4>
             <div className="grid md:grid-cols-2 gap-4">
               <div>
                  <label className="block text-xs font-bold text-monk-600 mb-1">主角描述 (Character)</label>
                  <textarea 
                    className="w-full p-2 border border-monk-200 rounded text-sm h-20"
                    placeholder="e.g. A young cute novice monk... (支持中文输入，系统将自动转换为AI提示词)"
                    value={characterDesc}
                    onChange={(e) => setCharacterDesc(e.target.value)}
                  />
               </div>
               <div>
                  <label className="block text-xs font-bold text-monk-600 mb-1">画面风格 (Art Style)</label>
                  <textarea 
                    className="w-full p-2 border border-monk-200 rounded text-sm h-20"
                    placeholder="e.g. Ghibli animation style... (支持中文输入，系统将自动转换为AI提示词)"
                    value={artStyle}
                    onChange={(e) => setArtStyle(e.target.value)}
                  />
               </div>
             </div>
          </div>

          <div className="space-y-6">
            
            {/* 2. Input Mode Tabs */}
            <div>
               <div className="flex border-b border-monk-200 mb-4">
                  <button 
                    onClick={() => setInputMode('TOPIC')}
                    className={`pb-2 px-4 font-bold text-lg transition-colors border-b-2 ${inputMode === 'TOPIC' ? 'border-monk-600 text-monk-800' : 'border-transparent text-monk-300 hover:text-monk-500'}`}
                  >
                    AI 构思
                  </button>
                  <button 
                    onClick={() => setInputMode('SCRIPT')}
                    className={`pb-2 px-4 font-bold text-lg transition-colors border-b-2 ${inputMode === 'SCRIPT' ? 'border-monk-600 text-monk-800' : 'border-transparent text-monk-300 hover:text-monk-500'}`}
                  >
                    输入文案
                  </button>
               </div>

               {inputMode === 'TOPIC' ? (
                 <div>
                    <label className="block text-sm font-bold text-monk-800 mb-2">输入视频主题</label>
                    <textarea 
                      className="w-full p-4 border border-monk-300 rounded-lg focus:ring-2 focus:ring-monk-500 focus:outline-none bg-stone-50 text-lg shadow-inner"
                      rows={3}
                      placeholder="例如：药师佛的十二大愿，给孩子讲因果故事..."
                      value={inputTopic}
                      onChange={(e) => setInputTopic(e.target.value)}
                    />
                 </div>
               ) : (
                 <div>
                    <label className="block text-sm font-bold text-monk-800 mb-2">如果没有文案则不必输入</label>
                    <textarea 
                      className="w-full p-4 border border-monk-300 rounded-lg focus:ring-2 focus:ring-monk-500 focus:outline-none bg-stone-50 text-sm shadow-inner font-mono"
                      rows={8}
                      placeholder="在此处粘贴您的文案。系统会自动将其拆分为分镜，并为每一句文案生成对应的画面提示词..."
                      value={inputScript}
                      onChange={(e) => setInputScript(e.target.value)}
                    />
                 </div>
               )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Audience */}
              <div>
                <label className="block text-sm font-bold text-monk-800 mb-2">目标受众 (Audience)</label>
                <div className="flex flex-col gap-2">
                  {['Children', 'General', 'Elderly'].map(aud => (
                    <button
                      key={aud}
                      onClick={() => setTargetAudience(aud)}
                      className={`py-3 px-4 rounded-lg border text-left transition-all flex items-center justify-between ${
                        targetAudience === aud 
                          ? 'bg-monk-600 text-white border-monk-600 shadow-md transform scale-[1.02]' 
                          : 'bg-white text-monk-600 border-monk-200 hover:bg-monk-50'
                      }`}
                    >
                      <span>{getAudienceLabel(aud)}</span>
                      {targetAudience === aud && (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Options (Duration for Topic / Voice for both) */}
              <div className="space-y-4">
                {inputMode === 'TOPIC' && (
                  <div>
                    <label className="block text-sm font-bold text-monk-800 mb-2">设置时长 (分钟)</label>
                    <div className="relative">
                       <input 
                          type="number" 
                          min="0.1" 
                          step="0.1"
                          value={targetDuration}
                          onChange={(e) => {
                             const val = parseFloat(e.target.value);
                             // Allow empty string temporarily or handle 0
                             setTargetDuration(isNaN(val) ? 0 : val);
                          }}
                          className="w-full p-3 pr-16 border border-monk-300 rounded-lg focus:ring-2 focus:ring-monk-500 focus:outline-none bg-white text-monk-800 text-lg font-bold shadow-sm"
                       />
                       <span className="absolute right-4 top-1/2 -translate-y-1/2 text-monk-400 text-xs font-bold pointer-events-none tracking-wider">
                          MINUTES
                       </span>
                    </div>
                    <p className="text-xs text-monk-400 mt-2 pl-1 flex items-center gap-1">
                       <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       {getDurationLabel(targetDuration)}
                    </p>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-bold text-monk-800 mb-2">选择配音</label>
                  <div className="flex gap-2 flex-wrap">
                      {AVAILABLE_VOICES.map(voice => (
                        <button
                          key={voice.name}
                          onClick={() => setSelectedVoice(voice.name)}
                          className={`py-2 px-3 rounded-lg border text-xs ${
                            selectedVoice === voice.name 
                              ? 'bg-monk-600 text-white border-monk-600' 
                              : 'bg-white text-monk-600 border-monk-200'
                          }`}
                        >
                            {voice.name} ({voice.gender === 'Male'?'男':'女'})
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button 
                onClick={handleCreateScript}
                disabled={inputMode === 'TOPIC' ? !inputTopic : !inputScript}
                className={`w-full py-5 rounded-xl font-bold text-xl shadow-xl transition-all flex items-center justify-center gap-3 ${
                  (inputMode === 'TOPIC' ? !inputTopic : !inputScript)
                    ? 'bg-stone-300 cursor-not-allowed text-stone-500' 
                    : 'bg-gradient-to-r from-monk-600 to-monk-500 hover:from-monk-700 hover:to-monk-600 text-white hover:scale-[1.01]'
                }`}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                下一步
              </button>
            </div>
          </div>
        </div>

        {/* HISTORY SECTION */}
        <div className="max-w-6xl mx-auto">
           {/* Improved Header with Import Button */}
           <div className="flex justify-between items-center mb-6 border-l-4 border-monk-600 pl-4">
              <h3 className="text-2xl font-serif text-monk-900">以往作品</h3>
              
              <label className="cursor-pointer bg-white border border-monk-300 text-monk-600 px-4 py-2 rounded-lg text-sm hover:bg-monk-50 transition shadow-sm flex items-center gap-2 active:scale-95">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                 </svg>
                 导入作品
                 <input type="file" className="hidden" accept=".json" onChange={handleImportProject} />
              </label>
           </div>
           
           {savedProjects.length === 0 ? (
             <div className="text-center py-12 text-monk-400 bg-white rounded-xl border border-dashed border-monk-300">
               <p>暂无历史作品，请开始您的第一次创作。</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {savedProjects.map(p => (
                 <div 
                    key={p.id} 
                    onClick={() => handleSelectProject(p)}
                    className="bg-white rounded-xl shadow-sm border border-monk-200 overflow-hidden hover:shadow-lg transition-all cursor-pointer group flex flex-col"
                 >
                    <div className="h-32 bg-monk-100 relative overflow-hidden flex-shrink-0">
                       {/* Thumbnail Preview: Video > Image > Placeholder */}
                       {p.scenes[0]?.videoUrl ? (
                          <video src={p.scenes[0].videoUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" muted />
                       ) : p.scenes[0]?.imageUrl ? (
                          <img src={p.scenes[0].imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                       ) : (
                          <div className="w-full h-full flex items-center justify-center text-monk-300">
                             <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          </div>
                       )}
                       <div className="absolute top-2 right-2">
                          <span className="bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                            {p.scenes.length} 镜头
                          </span>
                       </div>
                    </div>
                    <div className="p-5 flex-grow flex flex-col">
                       <h4 className="font-bold text-monk-800 text-lg mb-2 line-clamp-1">{p.title}</h4>
                       <div className="flex justify-between items-center text-xs text-monk-500 mb-4">
                          <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                          <span className="bg-monk-50 px-2 py-1 rounded border border-monk-100">{getAudienceLabel(p.targetAudience)}</span>
                       </div>
                       
                       <div className="mt-auto flex gap-2 pt-4 border-t border-monk-100">
                          <button className="flex-1 text-center py-2 bg-monk-600 text-white rounded text-sm hover:bg-monk-700">继续编辑</button>
                          
                          <button 
                            onClick={(e) => handleExportProject(e, p)}
                            className="px-3 py-2 text-monk-400 hover:text-monk-700 hover:bg-monk-50 rounded border border-transparent hover:border-monk-200"
                            title="导出/分享"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                               <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                             </svg>
                          </button>

                          <button 
                            onClick={(e) => handleDeleteProject(e, p.id)}
                            className="px-3 py-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="删除"
                          >
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                       </div>
                    </div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </Layout>
  );
};

export default App;