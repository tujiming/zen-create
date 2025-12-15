import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ScriptGenerationResponse } from "../types";

// --- Robust Audio Helpers ---

const decode = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  // Ensure we allocate enough space
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const decodeAudioData = async (
  data: Uint8Array,
  sampleRate: number = 24000
): Promise<AudioBuffer> => {
  // 1. Create a context WITHOUT forcing sampleRate (fixes browser compatibility issues)
  // Use a new context for decoding to ensure clean state
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  try {
    // 2. Safely handle Odd Byte Lengths (The Int16Array Crash Fix)
    // PCM 16-bit requires even number of bytes. If odd, drop the last byte.
    let safeData = data;
    if (data.byteLength % 2 !== 0) {
      safeData = data.slice(0, data.byteLength - 1);
    }
    
    const dataInt16 = new Int16Array(safeData.buffer, safeData.byteOffset, safeData.byteLength / 2);
    
    // 3. Create Buffer with the Model's Native Sample Rate (Default 24000Hz for Gemini TTS)
    const numChannels = 1;
    const frameCount = dataInt16.length;
    
    if (frameCount === 0) {
        throw new Error("Empty audio data received");
    }

    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    // 4. Convert Int16 PCM to Float32
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      // Normalize 16-bit signed int to [-1.0, 1.0] float
      channelData[i] = dataInt16[i] / 32768.0;
    }
    
    return buffer;
  } finally {
    // Clean up context to prevent memory leaks (Chrome limit is ~6 contexts)
    if (ctx.state !== 'closed') {
        ctx.close().catch(console.error);
    }
  }
};

// --- API Functions ---

// 1. Generate Script
export const generateScript = async (
  topic: string,
  audience: string,
  durationMinutes: number,
  apiKey: string
): Promise<ScriptGenerationResponse> => {
  const ai = new GoogleGenAI({ apiKey });
  
  // INCREASED DENSITY: Changed from 8s to 5s per scene to generate MORE videos.
  const SECONDS_PER_SCENE = 6;
  const estimatedScenes = Math.ceil((durationMinutes * 60) / SECONDS_PER_SCENE);

  // Customized Instructions for Buddhist Audiences
  let audienceInstruction = "";
  if (audience === "Children") {
    audienceInstruction = "Target Audience: CHILDREN (Age 5-10). Use the style of 'Jataka Tales' (本生经). Use simple language, focus on animals, kindness, and cause-and-effect (Karma). Tone: Cheerful, warm, storytelling.";
  } else if (audience === "Elderly") {
    audienceInstruction = "Target Audience: ELDERLY Buddhists. Focus on Pure Land (净土), Impermanence (无常), and peace of mind. Tone: Slow, comforting, respectful, deep wisdom, chanting style.";
  } else {
    audienceInstruction = "Target Audience: GENERAL PUBLIC. Modern Zen style, applicable to daily life, reducing stress. Tone: Calm, clear, inspiring.";
  }

  const prompt = `
    You are a wise Buddhist content creator (Dharma Master). Create a video script in Simplified Chinese (简体中文).
    The topic is: "${topic}".
    ${audienceInstruction}
    
    CONSTRAINTS:
    1. The total video duration MUST be approximately ${durationMinutes} minutes.
    2. Each visual scene corresponds to a ${SECONDS_PER_SCENE}-second video clip.
    3. Therefore, you MUST generate approximately ${estimatedScenes} distinct scenes.
    4. For each scene's 'narration', keep the text length strictly around 15-20 Chinese characters (readable in ${SECONDS_PER_SCENE}s).
    5. 'visualDescription' must be a highly detailed English prompt for an AI Video Generator.
    
    Return a JSON object with a title and a list of scenes. 
    Each scene should have:
    - 'narration': The text to be spoken.
    - 'visualDescription': English prompt. Include lighting (e.g., 'golden hour', 'soft temple light'), style (e.g., 'traditional ink painting', 'photorealistic 8k', 'ghibli style' for kids), and subject action.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                narration: { type: Type.STRING },
                visualDescription: { type: Type.STRING },
              },
              required: ["narration", "visualDescription"],
            },
          },
        },
        required: ["title", "scenes"],
      },
    },
  });

  if (!response.text) throw new Error("No text returned from Gemini");
  return JSON.parse(response.text) as ScriptGenerationResponse;
};

// 2. Generate Video (Veo)
export const generateSceneVideo = async (
  prompt: string,
  apiKey: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  
  console.log("Attempting Veo Video Generation...", prompt);

  // Note: 'numberOfVideos' must be 1 for current Veo Preview models.
  // To get more videos, we increased the number of scenes in the script generation step.
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview', 
    prompt: `Cinematic, highly detailed, buddhist atmosphere, ${prompt}`,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  let attempts = 0;
  while (!operation.done) {
    if (attempts > 30) throw new Error("Video generation timed out"); 
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
    attempts++;
  }

  if (operation.error) {
      throw new Error(`Veo API Error: ${JSON.stringify(operation.error)}`);
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Video generation completed but no URI returned.");

  const videoRes = await fetch(`${videoUri}&key=${apiKey}`);
  if (!videoRes.ok) throw new Error(`Failed to download generated video: ${videoRes.statusText}`);
  
  const videoBlob = await videoRes.blob();
  return URL.createObjectURL(videoBlob);
};

// 3. Generate Image (Fallback)
export const generateSceneImage = async (
  prompt: string,
  apiKey: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  
  console.log("Generating Image Fallback...", prompt);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { text: `Soft, buddhist art style, high quality, ${prompt}` },
      ],
    },
  });

  let base64Data = null;
  if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
              base64Data = part.inlineData.data;
              break;
          }
      }
  }

  if (!base64Data) throw new Error("No image data generated");
  
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], {type: 'image/png'});
  
  return URL.createObjectURL(blob);
};

// 4. Generate TTS (Correct Model: gemini-2.5-flash-preview-tts)
export const generateSceneAudio = async (
  text: string,
  voiceName: string,
  apiKey: string
): Promise<{ url: string; duration: number }> => {
  const ai = new GoogleGenAI({ apiKey });
  const MODEL_NAME = "gemini-2.5-flash-preview-tts";
  
  // Retry Logic for Stability
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
      try {
          console.log(`Generating Audio (Attempt ${attempt})... Model: ${MODEL_NAME}, Voice: ${voiceName}`);
          
          const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [{ parts: [{ text: text.trim() }] }], // Trim text
            config: {
              responseModalities: [Modality.AUDIO], // Strictly use Modality.AUDIO
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceName },
                },
              },
            },
          });

          const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          
          if (!base64Audio) {
              console.error("No audio data in response", response);
              throw new Error("API request succeeded but returned no audio data.");
          }

          // Robust Decoding
          const rawBytes = decode(base64Audio);
          
          // Convert PCM to AudioBuffer
          const audioBuffer = await decodeAudioData(rawBytes, 24000);

          // Convert Buffer to WAV Blob
          const wavBlob = bufferToWave(audioBuffer, 0, audioBuffer.length);
          const audioUrl = URL.createObjectURL(wavBlob);

          return { url: audioUrl, duration: audioBuffer.duration };

      } catch (e: any) {
          console.error(`Audio attempt ${attempt} failed:`, e);
          lastError = e;
          // Wait 1s before retry
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }
  }

  // Improve user-facing error message
  const errorMsg = lastError?.message || JSON.stringify(lastError) || "Unknown Error";
  throw new Error(`Audio generation failed (${MODEL_NAME}): ${errorMsg}`);
};

// Helper to convert AudioBuffer to WAV
function bufferToWave(abuffer: AudioBuffer, offset: number, len: number) {
  let numOfChan = abuffer.numberOfChannels,
      length = len * numOfChan * 2 + 44,
      buffer = new ArrayBuffer(length),
      view = new DataView(buffer),
      channels = [], i, sample,
      pos = 0;

  // write WAVE header
  setUint32(0x46464952);                         // "RIFF"
  setUint32(length - 8);                         // file length - 8
  setUint32(0x45564157);                         // "WAVE"

  setUint32(0x20746d66);                         // "fmt " chunk
  setUint32(16);                                 // length = 16
  setUint16(1);                                  // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2);                      // block-align
  setUint16(16);                                 // 16-bit

  setUint32(0x61746164);                         // "data" - chunk
  setUint32(length - pos - 4);                   // chunk length

  // write interleaved data
  for(i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while(pos < length) {
    for(i = 0; i < numOfChan; i++) {             
      // clamp and scale
      sample = Math.max(-1, Math.min(1, channels[i][offset])); 
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; 
      view.setInt16(pos, sample, true);          
      pos += 2;
    }
    offset++                                     
  }

  return new Blob([buffer], { type: "audio/wav" });

  function setUint16(data: any) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: any) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}