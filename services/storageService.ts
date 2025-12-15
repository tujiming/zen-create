import { Project } from "../types";

const STORAGE_KEY = 'zencreate_projects_v1';

export const saveProjectToStorage = (project: Project) => {
  try {
    const existing = getProjectsFromStorage();
    const index = existing.findIndex(p => p.id === project.id);
    
    // Update timestamp
    project.updatedAt = Date.now();

    if (index >= 0) {
      existing[index] = project;
    } else {
      existing.unshift(project); // Add to top
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.error("Failed to save project", e);
  }
};

export const getProjectsFromStorage = (): Project[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const deleteProjectFromStorage = (id: string) => {
  try {
    const existing = getProjectsFromStorage();
    const filtered = existing.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (e) {
    console.error("Failed to delete project", e);
    return [];
  }
};
