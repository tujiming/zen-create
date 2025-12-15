import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Scene } from '../types';

// Gentle Zen Music (Ensure it allows CORS)
const ZEN_BGM_URL = "https://cdn.pixabay.com/audio/2022/10/18/audio_31c2730e64.mp3"; 

interface PlayerProps {
  scenes: Scene[];
  onClose: () => void;
}

interface SubtitleChunk {
  text: string;
  start: number;
  end: number;
}

export const Player: React.FC<PlayerProps> = ({ scenes, onClose }) => {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Refs for Media
  const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const imgRef = useRef<HTMLImageElement>(document.createElement('img'));

  // Audio Refs 
  const narrationRef = useRef<HTMLAudioElement>(new Audio());
  const bgmRef = useRef<HTMLAudioElement>(new Audio(ZEN_BGM_URL));
  
  // Refs for Rendering & Recording
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const sceneStartTimeRef = useRef<number>(0); // For Ken Burns calculation
  
  // Audio Context for Recording Mix
  const audioCtxRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Config
  const currentScene = scenes[currentSceneIndex];

  // Calculate Subtitles for current scene
  const currentSubtitles = useMemo(() => {
    if (!currentScene) return [];
    const text = currentScene.narration || '';
    const duration = currentScene.audioDuration || 5; 

    // Split text by punctuation
    const parts = text.split(/([，。！？；：,.!?]+)/).reduce((acc, curr, i, arr) => {
        if (i % 2 === 0 && curr.trim()) {
            const punct = arr[i+1] || '';
            acc.push(curr.trim() + punct);
        }
        return acc;
    }, [] as string[]);

    const finalParts = parts.length > 0 ? parts : [text];
    
    const totalChars = finalParts.join('').length;
    const chunks: SubtitleChunk[] = [];
    let currentTime = 0;

    finalParts.forEach(part => {
        const partDuration = totalChars > 0 ? (part.length / totalChars) * duration : duration;
        chunks.push({
            text: part,
            start: currentTime,
            end: currentTime + partDuration
        });
        currentTime += partDuration;
    });

    return chunks;
  }, [currentScene]);

  // --- Initialization ---
  useEffect(() => {
    // Setup Media Elements
    bgmRef.current.loop = true;
    bgmRef.current.crossOrigin = "anonymous";
    bgmRef.current.volume = 0.15;

    narrationRef.current.crossOrigin = "anonymous";
    
    videoRef.current.crossOrigin = "anonymous";
    videoRef.current.playsInline = true;
    videoRef.current.muted = true;
    videoRef.current.loop = true;

    imgRef.current.crossOrigin = "anonymous";

    return () => {
        cancelAnimationFrame(requestRef.current);
        bgmRef.current.pause();
        narrationRef.current.pause();
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close();
        }
    };
  }, []);

  // --- Rendering Loop ---
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Clear Screen
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Current Scene (Hard Cut with Fallbacks)
    const videoReady = videoRef.current.readyState >= 2;
    const imgReady = imgRef.current.complete && imgRef.current.naturalWidth > 0;
    
    // Check if we should use video (preferred) or image (fallback)
    // We base this on what URL is currently loaded.
    // However, the `currentScene` object tells us what URLs exist.
    // The `useEffect` below loads the correct URL into the refs.
    // Here we just check what's ready to draw.
    
    // Prioritize Video if loaded
    if (videoReady && !videoRef.current.paused) {
        drawImageProp(ctx, videoRef.current, 0, 0, canvas.width, canvas.height);
    } 
    // Otherwise draw image with Ken Burns
    else if (imgReady) {
        // Calculate Ken Burns Zoom
        const now = Date.now();
        const duration = (currentScene?.audioDuration || 5) * 1000;
        const elapsed = now - sceneStartTimeRef.current;
        const progress = Math.min(elapsed / duration, 1.0);
        
        // Simple Zoom In: 1.0 -> 1.15
        const scale = 1.0 + (progress * 0.15);
        
        // We can also pan slightly. For now, simple center zoom.
        drawImageProp(ctx, imgRef.current, 0, 0, canvas.width, canvas.height, 0.5, 0.5, scale);
    } 
    else {
        // Fallback Black
        ctx.fillStyle = '#111';
        ctx.fillRect(0,0, canvas.width, canvas.height);
    }

    // 3. Draw Subtitles
    if (currentScene && isPlaying) {
        const audioTime = narrationRef.current.currentTime;
        const activeSub = currentSubtitles.find(s => audioTime >= s.start && audioTime <= s.end);

        if (activeSub) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const fontSize = 48;
            ctx.font = `bold ${fontSize}px "Merriweather", serif`;
            
            const x = canvas.width / 2;
            const y = canvas.height - 80;

            ctx.lineWidth = 6;
            ctx.strokeStyle = 'black';
            ctx.strokeText(activeSub.text, x, y);

            ctx.fillStyle = 'white';
            ctx.fillText(activeSub.text, x, y);
        }
    }

    requestRef.current = requestAnimationFrame(renderFrame);
  }, [currentScene, currentSubtitles, isPlaying]);

  // --- Scene Logic ---
  useEffect(() => {
    if (!isPlaying || !scenes[currentSceneIndex]) return;

    const scene = scenes[currentSceneIndex];
    sceneStartTimeRef.current = Date.now(); // Reset timer for animation
    
    // Load Visuals
    // Logic: If Video URL exists, use it. If not, use Image URL.
    
    const hasVideo = !!scene.videoUrl;
    
    if (hasVideo) {
        videoRef.current.src = scene.videoUrl!;
        videoRef.current.play().catch(console.warn);
        // Clear image
        imgRef.current.removeAttribute('src');
    } else if (scene.imageUrl) {
        imgRef.current.src = scene.imageUrl;
        // Stop video
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
    } else {
        // Nothing
        imgRef.current.removeAttribute('src');
        videoRef.current.pause();
    }

    // Play Audio
    if (scene.audioUrl) {
        narrationRef.current.src = scene.audioUrl;
        narrationRef.current.currentTime = 0;
        narrationRef.current.play().catch(() => {
             // Fallback if audio fails
             setTimeout(handleNext, (scene.audioDuration || 5) * 1000);
        });
    } else {
        const t = setTimeout(handleNext, 5000);
        return () => clearTimeout(t);
    }

  }, [currentSceneIndex, isPlaying]); 

  // Listen to audio end
  useEffect(() => {
    const handleEnded = () => {
        handleNext();
    };
    narrationRef.current.addEventListener('ended', handleEnded);
    return () => narrationRef.current.removeEventListener('ended', handleEnded);
  }, [currentSceneIndex, scenes.length]);

  const handleNext = () => {
    setCurrentSceneIndex(prev => {
        const next = prev + 1;
        if (next < scenes.length) {
            return next;
        } else {
            finishPlayback();
            return prev;
        }
    });
  };

  const finishPlayback = () => {
      setIsPlaying(false);
      bgmRef.current.pause();
      narrationRef.current.pause();
      videoRef.current.pause();
      cancelAnimationFrame(requestRef.current);

      if (isRecording) {
          stopRecording();
      }
  };

  // --- Recording Logic ---
  const startPlayback = async (recording: boolean = false) => {
    setIsPlaying(true);
    setCurrentSceneIndex(0);
    setIsRecording(recording);
    setStatusMsg(recording ? "正在录制并合成视频..." : "");
    recordedChunksRef.current = [];

    // Ensure Audio Context
    if (recording) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new AC();
            destRef.current = audioCtxRef.current.createMediaStreamDestination();
            
            try {
                const bgmNode = audioCtxRef.current.createMediaElementSource(bgmRef.current);
                bgmNode.connect(destRef.current);
                bgmNode.connect(audioCtxRef.current.destination);
            } catch (e) { }

            try {
                const narrNode = audioCtxRef.current.createMediaElementSource(narrationRef.current);
                narrNode.connect(destRef.current);
                narrNode.connect(audioCtxRef.current.destination);
            } catch (e) { }
        } else {
             if (audioCtxRef.current.state === 'suspended') {
                 await audioCtxRef.current.resume();
             }
        }

        const canvas = canvasRef.current;
        if (canvas && destRef.current) {
            const canvasStream = canvas.captureStream(30);
            const audioStream = destRef.current.stream;
            
            const combinedStream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...audioStream.getAudioTracks()
            ]);

            const options = { mimeType: 'video/webm;codecs=vp9' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                // @ts-ignore
                options.mimeType = 'video/webm'; 
            }

            try {
                const recorder = new MediaRecorder(combinedStream, options);
                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) recordedChunksRef.current.push(e.data);
                };
                recorder.start();
                mediaRecorderRef.current = recorder;
            } catch (e) {
                console.error("Recorder error", e);
                alert("浏览器不支持此录制格式。");
                setIsRecording(false);
                return;
            }
        }
    }

    requestRef.current = requestAnimationFrame(renderFrame);
    bgmRef.current.currentTime = 0;
    bgmRef.current.play().catch(console.error);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ZenCreate_Video_${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setIsRecording(false);
            setStatusMsg("下载已开始！");
            setTimeout(() => setStatusMsg(''), 3000);
        };
    }
  };

  const handleClose = () => {
      finishPlayback();
      onClose();
  };

  // Helper: Draw image nicely scaled
  // Added zoomFactor for Ken Burns
  function drawImageProp(ctx: CanvasRenderingContext2D, img: HTMLVideoElement | HTMLImageElement, x: number, y: number, w: number, h: number, offsetX = 0.5, offsetY = 0.5, zoomFactor = 1.0) {
     const imgW = (img instanceof HTMLVideoElement) ? (img.videoWidth) : img.naturalWidth;
     const imgH = (img instanceof HTMLVideoElement) ? (img.videoHeight) : img.naturalHeight;
     
     if (!imgW || !imgH) return;

     // Base Scale to cover the area
     const baseScale = Math.max(w / imgW, h / imgH);
     
     // Apply zoom
     const scale = baseScale * zoomFactor;

     // Calculate visible dimensions
     const nw = imgW * scale;
     const nh = imgH * scale;

     // Calculate offsets to center (or offset) the zoomed image
     // Default (0.5, 0.5) is center
     let cx = (w - nw) * offsetX;
     let cy = (h - nh) * offsetY;

     // Ensure we don't go out of bounds if we want to (optional, but good for "cover")
     // For simple zoom in from center, just use center coordinates
     
     // Correct math for center zoom:
     // Start X = x + (w - nw) / 2
     // Start Y = y + (h - nh) / 2
     
     const xPos = x + (w - nw) * offsetX;
     const yPos = y + (h - nh) * offsetY;
     
     ctx.drawImage(img, xPos, yPos, nw, nh);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col justify-center items-center font-sans">
      
      <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <canvas 
            ref={canvasRef} 
            width={1280} 
            height={720} 
            className="max-w-full max-h-full aspect-video shadow-2xl border border-stone-800"
        />
        
        {isRecording && (
            <div className="absolute top-4 left-4 bg-red-600 text-white px-4 py-2 rounded-full flex items-center gap-2 animate-pulse z-50">
                <div className="w-3 h-3 bg-white rounded-full"></div>
                <span className="font-bold text-sm">REC</span>
            </div>
        )}
        
        {statusMsg && !isRecording && (
             <div className="absolute top-4 left-4 bg-green-600 text-white px-4 py-2 rounded-full z-50">
                {statusMsg}
            </div>
        )}

        {!isPlaying && (
            <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center text-white p-4">
                <h2 className="text-3xl md:text-5xl font-serif mb-4 text-monk-200">作品预览 (Preview)</h2>
                <div className="space-y-4 text-center max-w-lg w-full">
                    <p className="text-stone-400 mb-4">
                        视频、配音、音乐与字幕已合成。
                    </p>
                    
                    <button 
                        onClick={() => startPlayback(false)}
                        className="w-full bg-stone-700 hover:bg-stone-600 text-white text-lg px-8 py-4 rounded-xl font-bold transition flex items-center justify-center gap-3"
                    >
                        仅预览 (Preview Only)
                    </button>

                    <button 
                        onClick={() => startPlayback(true)}
                        className="w-full bg-gradient-to-r from-monk-600 to-red-600 hover:from-monk-500 hover:to-red-500 text-white text-xl px-8 py-5 rounded-xl font-bold shadow-2xl transform transition hover:scale-[1.02] flex items-center justify-center gap-3"
                    >
                        录制并下载作品 (Download Video)
                    </button>
                    
                    <button onClick={handleClose} className="block w-full py-3 text-stone-500 hover:text-white transition">
                        返回编辑 (Back)
                    </button>
                </div>
            </div>
        )}

        <button 
            onClick={handleClose}
            className="absolute top-6 right-6 z-40 text-white/50 hover:text-white p-3 bg-black/20 hover:bg-black/40 rounded-full transition-all"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button>

      </div>
    </div>
  );
};