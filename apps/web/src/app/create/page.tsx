"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/api";

const STEPS = ["Token Info", "Links", "Review"] as const;
type Step = 0 | 1 | 2;

type FieldErrors = Partial<Record<string, string>>;
type TouchedFields = Partial<Record<string, boolean>>;

function validateStep0(form: {
  name: string;
  ticker: string;
  decimals: number;
  maxSupply: string;
  description: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name || form.name.length < 2) errors["name"] = "Name must be at least 2 characters.";
  if (form.name.length > 80) errors["name"] = "Name must be 80 characters or fewer.";
  if (!form.ticker || form.ticker.length < 2) errors["ticker"] = "Ticker must be at least 2 characters.";
  if (form.ticker.length > 10) errors["ticker"] = "Ticker must be 10 characters or fewer.";
  if (!/^[A-Z0-9]+$/.test(form.ticker)) errors["ticker"] = "Ticker must be uppercase A–Z and 0–9 only.";
  if (!form.maxSupply || !/^\d+$/.test(form.maxSupply)) errors["maxSupply"] = "Max supply must be a positive whole number.";
  else if (Number(form.maxSupply) <= 0) errors["maxSupply"] = "Max supply must be greater than zero.";
  if (!form.description || form.description.length < 10)
    errors["description"] = "Description must be at least 10 characters.";
  if (form.description.length > 2000) errors["description"] = "Description must be 2000 characters or fewer.";
  return errors;
}

export default function CreatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>(0);

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

  // S10: per-field touched state — errors show only after blur or submit attempt
  const [touched, setTouched] = useState<TouchedFields>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const step0Errors = validateStep0(form);
  const showError = (field: string) =>
    (touched[field] || submitAttempted) ? step0Errors[field] : undefined;

  function blur(field: string) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  function set(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (step === 0) {
      setSubmitAttempted(true);
      if (Object.keys(step0Errors).length > 0) return;
    }
    if (step < 2) setStep((s) => (s + 1) as Step);
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
      {/* Header */}
      <div className="mb-8">
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← Back to feed
        </a>
        <h1 className="mt-3 text-3xl font-black text-white">Launch a token</h1>
        <p className="mt-2 text-zinc-400">
          Fixed supply · No mint · No hidden admin powers by default.{" "}
          <span className="text-green-400">Testnet only.</span>
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              onClick={() => i < step && setStep(i as Step)}
              className={`flex items-center gap-2 text-xs font-bold transition-colors ${
                i === step
                  ? "text-white"
                  : i < step
                  ? "text-brand-400 hover:text-brand-300 cursor-pointer"
                  : "text-zinc-600 cursor-default"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black border-2 transition-colors ${
                  i === step
                    ? "border-brand-500 bg-brand-500/20 text-brand-300"
                    : i < step
                    ? "border-brand-700 bg-brand-900/50 text-brand-400"
                    : "border-zinc-700 text-zinc-600"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`mx-2 flex-1 h-0.5 ${i < step ? "bg-brand-700" : "bg-zinc-800"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Token Info */}
      {step === 0 && (
        <form onSubmit={next} noValidate className="space-y-6">
          <div className="card space-y-4">
            <h2 className="font-black text-zinc-200">Token basics</h2>

            <FieldGroup label="Token name *" error={showError("name")}>
              <input
                className={`input ${showError("name") ? "input-error" : ""}`}
                placeholder="e.g. Orange Protocol"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => blur("name")}
                autoFocus
              />
            </FieldGroup>

            <div className="grid grid-cols-2 gap-4">
              <FieldGroup label="Ticker *" error={showError("ticker")}>
                <input
                  className={`input font-mono uppercase ${showError("ticker") ? "input-error" : ""}`}
                  placeholder="ORP"
                  value={form.ticker}
                  onChange={(e) => set("ticker", e.target.value.toUpperCase())}
                  onBlur={() => blur("ticker")}
                />
                {!showError("ticker") && (
                  <p className="mt-1 text-[11px] text-zinc-600">Uppercase A-Z / 0-9</p>
                )}
              </FieldGroup>
              <FieldGroup label="Decimals">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={18}
                  value={form.decimals}
                  onChange={(e) => set("decimals", parseInt(e.target.value, 10))}
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Max supply *" error={showError("maxSupply")}>
              <input
                className={`input font-mono ${showError("maxSupply") ? "input-error" : ""}`}
                placeholder="1000000000"
                value={form.maxSupply}
                onChange={(e) => set("maxSupply", e.target.value)}
                onBlur={() => blur("maxSupply")}
              />
              {!showError("maxSupply") && (
                <p className="mt-1 text-[11px] text-zinc-600">
                  Fixed forever — cannot be increased after launch.
                </p>
              )}
            </FieldGroup>

            <FieldGroup label="Description *" error={showError("description")}>
              <textarea
                className={`input min-h-[90px] resize-y ${showError("description") ? "input-error" : ""}`}
                placeholder="What is this token for? Who is it for?"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                onBlur={() => blur("description")}
              />
              <p className="mt-1 text-[11px] text-zinc-600 text-right">
                {form.description.length} / 2000
              </p>
            </FieldGroup>
          </div>

          {submitAttempted && Object.keys(step0Errors).length > 0 && (
            <div className="rounded-xl border-2 border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-400">
              Fix the errors above before continuing.
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-3 text-base">
            Next: Links →
          </button>
        </form>
      )}

      {/* Step 1: Links */}
      {step === 1 && (
        <form onSubmit={next} className="space-y-6">
          <div className="card space-y-4">
            <h2 className="font-black text-zinc-200">Links</h2>
            <p className="text-xs text-zinc-500">All optional. Help the community find your project.</p>
            {(["website", "twitter", "github"] as const).map((field) => (
              <div key={field}>
                <label className="label">{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                <input
                  className="input"
                  type="url"
                  placeholder="https://…"
                  value={form[field]}
                  onChange={(e) => set(field, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="card space-y-4">
            <h2 className="font-black text-zinc-200">Advanced (optional)</h2>
            <div>
              <label className="label">Icon URL</label>
              <input
                className="input"
                type="url"
                placeholder="https://…"
                value={form.iconUrl}
                onChange={(e) => set("iconUrl", e.target.value)}
              />
            </div>
            <div>
              <label className="label">Source repo</label>
              <input
                className="input"
                type="url"
                placeholder="https://github.com/…"
                value={form.sourceRepoUrl}
                onChange={(e) => set("sourceRepoUrl", e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(0)} className="btn-secondary flex-1 py-3">
              ← Back
            </button>
            <button type="submit" className="btn-primary flex-1 py-3">
              Next: Review →
            </button>
          </div>
        </form>
      )}

      {/* Step 2: Review */}
      {step === 2 && (
        <form onSubmit={submit} className="space-y-6">
          <div className="card space-y-3">
            <h2 className="font-black text-zinc-200">Review your token</h2>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <ReviewRow label="Name" value={form.name} />
              <ReviewRow label="Ticker" value={form.ticker} mono />
              <ReviewRow label="Max Supply" value={Number(form.maxSupply).toLocaleString()} mono />
              <ReviewRow label="Decimals" value={String(form.decimals)} mono />
            </div>

            <div className="rounded-lg border-2 border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">Description</p>
              <p className="text-zinc-300 leading-relaxed">{form.description}</p>
            </div>

            {(form.website || form.twitter || form.github) && (
              <div className="flex flex-wrap gap-2">
                {form.website && <LinkChip label="Website" href={form.website} />}
                {form.twitter && <LinkChip label="Twitter" href={form.twitter} />}
                {form.github && <LinkChip label="GitHub" href={form.github} />}
              </div>
            )}
          </div>

          {/* Safe defaults */}
          <div className="rounded-xl border-2 border-green-800 bg-green-950/30 px-4 py-3 text-sm">
            <p className="font-black text-green-400 mb-1">Safe defaults confirmed</p>
            <ul className="text-green-700 space-y-0.5 text-xs">
              <li>Fixed supply — cannot mint more tokens</li>
              <li>No admin keys — no privileged functions</li>
              <li>No pause — transfers always enabled</li>
              <li>No upgrade — contract is immutable</li>
              <li>OP_NET testnet only — no real funds</li>
            </ul>
          </div>

          {error && (
            <div className="rounded-xl border-2 border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1 py-3">
              ← Back
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 py-3 text-base">
              {loading ? "Creating…" : "Launch token →"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// S10: Field group with label + optional inline error message
function FieldGroup({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && (
        <p className="mt-1 text-xs font-semibold text-red-400 flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border-2 border-zinc-800 bg-zinc-900 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className={`mt-0.5 text-sm text-zinc-200 ${mono ? "font-mono" : "font-bold"}`}>
        {value}
      </p>
    </div>
  );
}

function LinkChip({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border-2 border-zinc-700 px-2.5 py-1 text-xs font-bold text-zinc-400 hover:text-zinc-200 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {label} ↗
    </a>
  );
}
