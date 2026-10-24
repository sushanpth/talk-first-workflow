import { useNavigate, useRouterState } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useAllProjects, useProject } from '@/lib/api';
import { sectionOf } from '@/routes/projects';

/** The current project's name as a dropdown; picking another keeps the current section. */
export function ProjectSwitcher({ project }: { project: string }) {
  const navigate = useNavigate();
  const routeId = useRouterState({ select: (s) => s.matches.at(-1)?.routeId ?? '' });
  const current = useProject(project);
  const all = useAllProjects();
  const items = all.data?.items ?? [];
  // Past the list limit, or before the list loads, the current project still needs an option.
  const options = items.some((p) => p.id === project)
    ? items
    : [{ id: project, name: current.data?.name ?? project }, ...items];

  return (
    <div className="relative flex min-w-0 shrink items-center">
      <select
        aria-label="Switch project"
        value={project}
        onChange={(e) => navigate({ to: sectionOf(routeId).to, params: { project: e.target.value } })}
        className="max-w-48 min-w-0 cursor-pointer appearance-none truncate rounded-md bg-transparent py-1 pr-6 pl-2 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-1 size-4 text-muted-foreground"
      />
    </div>
  );
}
