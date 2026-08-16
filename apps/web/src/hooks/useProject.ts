import { createContext, useContext } from 'react';
import type { AccessSession, MusicVideoProject, ProjectHealth, TimelineIssue } from '@music-video/shared';

export interface SessionState extends AccessSession {
  accessRequired: boolean;
}

export const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) {
    return { authenticated: false, demoMode: true, openaiConfigured: false, supabaseConfigured: false, accessRequired: false };
  }
  return value;
}

export interface ProjectContextValue {
  project: MusicVideoProject;
  health: ProjectHealth;
  timingIssues: TimelineIssue[];
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  reload: () => Promise<void>;
  setProject: (project: MusicVideoProject, health?: ProjectHealth, issues?: TimelineIssue[]) => void;
  markSave: (state: 'idle' | 'saving' | 'saved' | 'error') => void;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (!value) throw new Error('Project context missing');
  return value;
}
