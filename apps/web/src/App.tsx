import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PRODUCT_NAME } from '@music-video/shared';
import { SessionContext, useSession, type SessionState } from './hooks/useProject';
import { api } from './lib/api';
import { AccessPage } from './pages/AccessPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewProjectPage } from './pages/NewProjectPage';
import { ProjectLayout } from './pages/ProjectLayout';
import { SetupPage } from './pages/SetupPage';
import { StylePage } from './pages/StylePage';
import { BiblePage } from './pages/BiblePage';
import { CharactersPage } from './pages/CharactersPage';
import { StoryboardPage } from './pages/StoryboardPage';
import { ImagesPage } from './pages/ImagesPage';
import { VideoPage } from './pages/VideoPage';
import { ResultPage } from './pages/ResultPage';
import { PipelinePage } from './pages/PipelinePage';
import { WatchPage } from './pages/WatchPage';

export function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  const loadSession = useCallback(async () => {
    setBootError(null);
    setBooting(true);
    try {
      const data = await api.session();
      setSession({
        authenticated: data.authenticated,
        accessRequired: data.accessRequired,
        demoMode: data.demoMode,
        openaiConfigured: data.openaiConfigured,
        falConfigured: data.falConfigured,
        imagesDemoMode: data.imagesDemoMode,
        supabaseConfigured: data.supabaseConfigured,
      });
    } catch {
      setSession(null);
      setBootError('The studio is waking up or unreachable. Try again in a moment.');
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  if (booting && !session) {
    return (
      <div className="app-shell">
        <div className="sprocket" aria-hidden="true" />
        <div className="page boot-screen">
          <div className="brand">
            <small>Studio</small>
            <strong>{PRODUCT_NAME}</strong>
          </div>
          <p className="muted">Opening the director’s desk…</p>
          <div className="boot-spinner" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-shell">
        <div className="sprocket" aria-hidden="true" />
        <div className="page boot-screen">
          <div className="brand">
            <small>Studio</small>
            <strong>{PRODUCT_NAME}</strong>
          </div>
          <div className="banner error">{bootError}</div>
          <button className="btn btn-primary" onClick={() => void loadSession()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={session}>
      <Routes>
        <Route path="/watch/:shareId" element={<WatchPage />} />
        <Route
          path="*"
          element={
            <div className="app-shell">
              <div className="sprocket" aria-hidden="true" />
              <div className="app-main">
                <Routes>
                  <Route
                    path="/access"
                    element={<AccessPage onAuthed={() => setSession({ ...session, authenticated: true })} />}
                  />
                  <Route
                    path="/"
                    element={
                      <RequireAuth>
                        <DashboardPage onLogout={() => setSession({ ...session, authenticated: false })} />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/projects/new"
                    element={
                      <RequireAuth>
                        <NewProjectPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/projects/:id"
                    element={
                      <RequireAuth>
                        <ProjectLayout />
                      </RequireAuth>
                    }
                  >
                    <Route path="setup" element={<SetupPage />} />
                    <Route path="style" element={<StylePage />} />
                    <Route path="bible" element={<BiblePage />} />
                    <Route path="characters" element={<CharactersPage />} />
                    <Route path="storyboard" element={<StoryboardPage />} />
                    <Route path="images" element={<ImagesPage />} />
                    <Route path="video" element={<VideoPage />} />
                    <Route path="pipeline" element={<PipelinePage />} />
                    <Route path="result/:jobId" element={<ResultPage />} />
                    <Route index element={<Navigate to="setup" replace />} />
                  </Route>
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </div>
            </div>
          }
        />
      </Routes>
    </SessionContext.Provider>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.accessRequired && !session.authenticated) {
    return <Navigate to="/access" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function NotFoundPage() {
  return (
    <div className="page boot-screen">
      <h1>That page is not on the cut</h1>
      <p className="muted">The link is missing or the scene was deleted.</p>
      <a className="btn btn-primary" href="/">
        Back to projects
      </a>
    </div>
  );
}
