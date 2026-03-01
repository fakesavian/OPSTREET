import type { ProjectDTO } from "@opfun/shared";

const BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export async function fetchProjects(sort: "new" | "trending" = "new"): Promise<ProjectDTO[]> {
  const url = sort === "trending" ? `${BASE}/projects?sort=trending` : `${BASE}/projects`;
  const res = await fetch(url, { next: { revalidate: 10 } });
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json() as Promise<ProjectDTO[]>;
}

export async function pledgeProject(
  id: string,
  opts: { walletAddress?: string } = {},
): Promise<{ pledgeCount: number; status: string; graduated: boolean }> {
  const res = await fetch(`${BASE}/projects/${id}/pledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: opts.walletAddress }),
  });
  if (!res.ok) throw new Error("Failed to pledge");
  return res.json() as Promise<{ pledgeCount: number; status: string; graduated: boolean }>;
}

export async function viewProject(id: string): Promise<void> {
  fetch(`${BASE}/projects/${id}/view`, { method: "POST" }).catch(() => undefined);
}

export interface CheckRun {
  id: string;
  type: string;
  status: string;
  outputJson: string | null;
  createdAt: string;
}

export interface WatchEvent {
  id: string;
  severity: string;
  title: string;
  detailsJson?: string | null;
  txId?: string | null;
  resolved: boolean;
  createdAt: string;
}

export async function resolveWatchEvent(
  projectId: string,
  eventId: string,
  adminSecret: string,
): Promise<WatchEvent> {
  const res = await fetch(
    `${BASE}/projects/${projectId}/watch-events/${eventId}/resolve`,
    { method: "PATCH", headers: { "X-Admin-Secret": adminSecret } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<WatchEvent>;
}

export async function fetchProject(slug: string): Promise<ProjectDTO & {
  checkRuns: CheckRun[];
  watchEvents: WatchEvent[];
}> {
  const res = await fetch(`${BASE}/projects/${slug}`, { next: { revalidate: 5 } });
  if (res.status === 404) throw new Error("NOT_FOUND");
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
}

export async function createProject(data: {
  name: string;
  ticker: string;
  decimals: number;
  maxSupply: string;
  description: string;
  links: Record<string, string>;
  iconUrl?: string;
  sourceRepoUrl?: string;
}): Promise<ProjectDTO> {
  const res = await fetch(`${BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to create project");
  }
  return res.json() as Promise<ProjectDTO>;
}
