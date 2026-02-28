import type { ProjectDTO } from "@opfun/shared";

const BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export async function fetchProjects(): Promise<ProjectDTO[]> {
  const res = await fetch(`${BASE}/projects`, { next: { revalidate: 10 } });
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json() as Promise<ProjectDTO[]>;
}

export async function fetchProject(slug: string): Promise<ProjectDTO & {
  checkRuns: unknown[];
  watchEvents: unknown[];
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
