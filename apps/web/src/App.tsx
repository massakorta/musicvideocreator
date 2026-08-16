import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
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

export function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const location = useLocation();

  useEffect(() => {
    api
      .session()
      .then((data) =>
        setSession({
          authenticated: data.authenticated,
          accessRequired: data.accessRequired,
          demoMode: data.demoMode,
          openaiConfigured: data.openaiConfigured,
          supabaseConfigured: data.supabaseConfigured,
        }),
      )
      .catch(() =>
        setSession({
          authenticated: false,
          accessRequired: true,
          demoMode: true,
          openaiConfigured: false,
          supabaseConfigured: false,
        }),
      );
  }, [location.pathname]);

  if (!session) {
    return (
      <div className="app-shell">
        <div className="sprocket" />
        <div className="page">Loading {PRODUCT_NAME}…</div>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={session}>
      <div className="app-shell">
        <div className="sprocket" aria-hidden="true" />
        <div className="app-main">
          <Routes>
            <Route path="/access" element={<AccessPage onAuthed={() => setSession({ ...session, authenticated: true })} />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <DashboardPage />
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
              <Route path="result/:jobId" element={<ResultPage />} />
              <Route index element={<Navigate to="setup" replace />} />
            </Route>
          </Routes>
        </div>
      </div>
    </SessionContext.Provider>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.accessRequired && !session.authenticated) {
    return <Navigate to="/access" replace />;
  }
  return children;
}
