import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProject } from '../hooks/useProject';

export function ResultPage() {
  const { jobId: _jobId } = useParams();
  const { project } = useProject();
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/projects/${project.id}/video`, { replace: true });
  }, [navigate, project.id]);

  return null;
}
