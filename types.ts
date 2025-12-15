
export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO'
}

export interface Scene {
  id: string;
  narration: string;
  visualPrompt: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string; // Blob URL for the audio
  audioDuration?: number; // Duration in seconds
  isGeneratingImage: boolean;
  isGeneratingVideo: boolean;
  isGeneratingAudio: boolean;
}

export interface Project {
  id: string; // Unique ID for storage
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
  title: string;
  targetAudience: 'Children' | 'General' | 'Elderly';
  coreValue: string; // e.g., Compassion, Impermanence
  scenes: Scene[];
}

export interface ScriptGenerationResponse {
  title: string;
  scenes: {
    narration: string;
    visualDescription: string;
  }[];
}

// Helper to define available voices
// Strictly using supported voices: Puck, Charon, Kore, Fenrir, Zephyr
export const AVAILABLE_VOICES = [
  { name: 'Puck', gender: 'Male', style: 'Soft' },
  { name: 'Charon', gender: 'Male', style: 'Deep' },
  { name: 'Kore', gender: 'Female', style: 'Calm' },
  { name: 'Fenrir', gender: 'Male', style: 'Strong' },
  { name: 'Zephyr', gender: 'Female', style: 'Gentle' },
];
