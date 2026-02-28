"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/api";

export default function CreatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    ticker: "",
    decimals: 18,
    maxSupply: "1000000000",
    description: "",
    website: "",
    twitter: "",
    github: "",
    iconUrl: "",
    sourceRepoUrl: "",
  });

  function set(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const links: Record<string, string> = {};
      if (form.website) links["website"] = form.website;
      if (form.twitter) links["twitter"] = form.twitter;
      if (form.github) links["github"] = form.github;

      const project = await createProject({
        name: form.name,
        ticker: form.ticker.toUpperCase(),
        decimals: form.decimals,
        maxSupply: form.maxSupply,
        description: form.description,
        links,
        iconUrl: form.iconUrl || undefined,
        sourceRepoUrl: form.sourceRepoUrl || undefined,
      });
      router.push(`/p/${project.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white">Launch a token</h1>
        <p className="mt-2 text-zinc-400">
          Fixed supply · No mint · No hidden admin powers by default.{" "}
          <span className="text-green-400">Testnet only.</span>
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {/* Token basics */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-zinc-200">Token basics</h2>

          <div>
            <label className="label">Token name *</label>
            <input
              className="input"
              placeholder="e.g. Orange Protocol"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              minLength={2}
              maxLength={80}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Ticker *</label>
              <input
                className="input font-mono"
                placeholder="e.g. ORP"
                value={form.ticker}
                onChange={(e) => set("ticker", e.target.value.toUpperCase())}
                required
                minLength={2}
                maxLength={10}
                pattern="[A-Z0-9]+"
              />
              <p className="mt-1 text-[11px] text-zinc-600">Uppercase letters/numbers only</p>
            </div>
            <div>
              <label className="label">Decimals</label>
              <input
                className="input"
                type="number"
                min={0}
                max={18}
                value={form.decimals}
                onChange={(e) => set("decimals", parseInt(e.target.value, 10))}
              />
            </div>
          </div>

          <div>
            <label className="label">Max supply *</label>
            <input
              className="input font-mono"
              placeholder="1000000000"
              value={form.maxSupply}
              onChange={(e) => set("maxSupply", e.target.value)}
              required
              pattern="\d+"
            />
            <p className="mt-1 text-[11px] text-zinc-600">
              Fixed. Cannot be increased after launch (safe default).
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="card">
          <label className="label">Description *</label>
          <textarea
            className="input min-h-[100px] resize-y"
            placeholder="What is this token for? Who is it for? What problem does it solve?"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            required
            minLength={10}
            maxLength={2000}
          />
        </div>

        {/* Links */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-zinc-200">Links (optional)</h2>
          {(["website", "twitter", "github"] as const).map((field) => (
            <div key={field}>
              <label className="label">{field.charAt(0).toUpperCase() + field.slice(1)}</label>
              <input
                className="input"
                type="url"
                placeholder={`https://...`}
                value={form[field]}
                onChange={(e) => set(field, e.target.value)}
              />
            </div>
          ))}
        </div>

        {/* Advanced (optional) */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-zinc-200">Advanced (optional)</h2>
          <div>
            <label className="label">Icon URL</label>
            <input
              className="input"
              type="url"
              placeholder="https://..."
              value={form.iconUrl}
              onChange={(e) => set("iconUrl", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Source repo URL</label>
            <input
              className="input"
              type="url"
              placeholder="https://github.com/..."
              value={form.sourceRepoUrl}
              onChange={(e) => set("sourceRepoUrl", e.target.value)}
            />
          </div>
        </div>

        {/* Safe defaults notice */}
        <div className="rounded-xl border border-green-900/50 bg-green-950/30 px-4 py-3 text-sm text-green-400">
          <span className="font-semibold">Safe defaults active:</span> Fixed supply · No mint · No
          admin keys · No pause · OP_NET testnet only.
        </div>

        {error && (
          <div className="rounded-xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
          {loading ? "Creating project…" : "Create project →"}
        </button>
      </form>
    </div>
  );
}
