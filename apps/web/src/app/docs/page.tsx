/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Docs — OpStreet Secure Launchpad",
  description: "Learn how to launch tokens on OpStreet, understand the Risk Card, and use the Trading Floor.",
};

// ── Section & subsection helpers ────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="op-panel p-6 space-y-4">
        <h2 className="text-xl font-black text-ink border-b-3 border-ink pb-3">{title}</h2>
        <div className="space-y-3 rounded-[18px] border-2 border-ink/10 bg-[#fff8e8] p-4 text-sm font-semibold leading-relaxed text-[#4b2a12]">
          {children}
        </div>
      </div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-black text-ink mb-1.5">{title}</h3>
      <div className="space-y-1 text-[#4b2a12]">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-xs bg-ink/5 border border-ink/10 rounded px-1.5 py-0.5 text-ink">{children}</code>;
}

function InfoBox({ children, color = "yellow" }: { children: React.ReactNode; color?: "yellow" | "green" | "red" }) {
  const cls = color === "green" ? "border-opGreen bg-opGreen/10 text-ink"
    : color === "red" ? "border-opRed bg-opRed/5 text-opRed"
    : "border-opYellow bg-opYellow/20 text-ink";
  return (
    <div className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold ${cls}`}>
      {children}
    </div>
  );
}

function CheckList({ items }: { items: { pass: boolean; label: string }[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map(({ pass, label }) => (
        <li key={label} className="flex items-start gap-2 text-sm">
          <span className={`font-black mt-0.5 ${pass ? "text-opGreen" : "text-opRed"}`}>{pass ? "✓" : "✗"}</span>
          <span className={pass ? "text-ink" : "text-[var(--text-muted)]"}>{label}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Sidebar nav ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "what-is-opstreet",    label: "What is OpStreet?" },
  { id: "quick-start",      label: "Quick Start" },
  { id: "create-token",     label: "Create a Token" },
  { id: "risk-card",        label: "Risk Card" },
  { id: "security-checks",  label: "Security Checks" },
  { id: "launch-pipeline",  label: "Launch Pipeline" },
  { id: "trading-floor",    label: "Trading Floor" },
  { id: "wallet",           label: "Wallet & Auth" },
  { id: "testnet-buy",      label: "Testnet Buy Flow" },
  { id: "faq",              label: "FAQ" },
  { id: "roadmap",          label: "Roadmap" },
];

// ── Page ────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl py-6">
      <div className="op-panel mb-8 p-6">
        <Link href="/" className="text-xs font-bold text-[var(--text-muted)] hover:text-ink transition-colors">
          ← Back to Feed
        </Link>
        <h1 className="mt-3 text-4xl font-black text-ink">Documentation</h1>
        <p className="mt-3 max-w-2xl rounded-[18px] border-2 border-ink/10 bg-[#fff8e8] px-4 py-3 text-sm font-semibold leading-relaxed text-[#4b2a12]">
          Everything you need to know about launching tokens, reading Risk Cards, and using the Trading Floor on OpStreet — powered by OP_NET testnet.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="lg:w-52 shrink-0">
          <div className="op-panel p-4 sticky top-24">
            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] mb-3">Contents</p>
            <nav className="space-y-0.5">
              {SECTIONS.map(({ id, label }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="block text-xs font-bold text-[var(--text-secondary)] hover:text-ink hover:bg-opYellow/40 rounded-lg px-2 py-1.5 transition-all"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="flex-1 space-y-6">

          {/* WHAT IS OPFUN */}
          <Section id="what-is-opstreet" title="What is OpStreet?">
            <p>
              OpStreet is a <strong className="text-ink">token launchpad for OP_NET testnet</strong> — the Bitcoin L2 that runs
              EVM-compatible smart contracts (called OP_20 contracts) directly on Bitcoin via Ordinals.
            </p>
            <p>
              Like Pump.fun on Solana, OpStreet lets anyone launch a token in minutes. Unlike Pump.fun,
              every token gets an <strong className="text-ink">automated security audit (Risk Card)</strong> powered by
              the Bob AI assistant before it can graduate.
            </p>
            <InfoBox color="yellow">
              OpStreet is powered by OP_NET. All trading, pricing, and shop mints use confirmed
              testnet pool data only.
            </InfoBox>
            <Sub title="Key Features">
              <CheckList items={[
                { pass: true,  label: "One-click token launch (OP_20 contract, fixed supply)" },
                { pass: true,  label: "Automated Risk Card (Bob AI security audit)" },
                { pass: true,  label: "Live pool trading — wallet-signed swaps on OP_NET testnet" },
                { pass: true,  label: "Watchtower monitoring after contract deployment" },
                { pass: true,  label: "Trading Floor — live community chat, callouts, charts" },
                { pass: true,  label: "Achievement badges and leaderboard gamification" },
                { pass: true,  label: "OP721 shop collection — wallet-bound NFT items" },
                { pass: false, label: "Mainnet support (pending OP_NET mainnet launch)" },
              ]} />
            </Sub>
          </Section>

          {/* QUICK START */}
          <Section id="quick-start" title="Quick Start">
            <Sub title="5 steps to launch a token">
              <ol className="list-none space-y-3">
                {[
                  { n: "1", title: "Connect your wallet", body: "Click \"Connect Wallet\" in the header. Supports Unisat, OKX, and OPNet Plugin. For quick testing, enter a testnet address manually." },
                  { n: "2", title: "Create a token", body: "Click \"+ Create Coin\", fill in name / ticker / supply / description. Takes ~10 seconds." },
                  { n: "3", title: "Run Security Checks", body: "On the token page, click \"Run Security Checks →\". Bob AI will scaffold and audit your OP_20 contract. Takes 15–60s." },
                  { n: "4", title: "Read the Risk Card", body: "Once checks complete, review your Risk Card score (0 = safe, 100 = critical). All OpStreet tokens default to LOW RISK because the template has no mint / no admin / no pause." },
                  { n: "5", title: "Deploy & trade", body: "Deploy your token to OP_NET testnet, create a liquidity pool, and start trading with live pool quotes." },
                ].map(({ n, title, body }) => (
                  <li key={n} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-opYellow text-xs font-black text-ink">{n}</span>
                    <div>
                      <p className="font-black text-ink">{title}</p>
                      <p className="text-[var(--text-muted)] text-xs mt-0.5">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Sub>
          </Section>

          {/* CREATE TOKEN */}
          <Section id="create-token" title="Create a Token">
            <Sub title="Token parameters">
              <p>When you create a token, you provide:</p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li><strong>Name</strong> — full display name (e.g. "Orange Protocol")</li>
                <li><strong>Ticker</strong> — 2–10 uppercase characters (e.g. "ORP")</li>
                <li><strong>Max Supply</strong> — fixed forever, cannot be changed after launch</li>
                <li><strong>Decimals</strong> — typically 18 (like ERC-20)</li>
                <li><strong>Description</strong> — 10–2000 chars, shown on the token page</li>
                <li><strong>Links</strong> — optional website, Twitter, GitHub</li>
              </ul>
            </Sub>
            <Sub title="Safe defaults (always enforced)">
              <CheckList items={[
                { pass: true, label: "No mint() function — supply is fixed at deployment" },
                { pass: true, label: "No owner/admin key — no privileged addresses" },
                { pass: true, label: "No pause() — transfers are always enabled" },
                { pass: true, label: "No upgrade mechanism — contract is immutable" },
                { pass: true, label: "100% supply minted to deployer at deployment" },
              ]} />
            </Sub>
            <Sub title="Under the hood">
              <p>
                When you submit the form, OpStreet creates a project record in the database. The actual
                OP_20 contract (AssemblyScript) is generated when you run security checks. The generated
                contract uses the <Code>btc-runtime</Code> OP_20 base class from OP_NET.
              </p>
            </Sub>
          </Section>

          {/* RISK CARD */}
          <Section id="risk-card" title="Risk Card">
            <p>
              The <strong className="text-ink">Risk Card</strong> is OpStreet's transparency report for each token.
              It shows the exact risk properties of the contract so buyers can make informed decisions.
            </p>
            <Sub title="Risk Score (0–100)">
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {[
                  { range: "0–19", label: "LOW RISK", cls: "bg-opGreen/20 border-opGreen text-opGreen" },
                  { range: "20–49", label: "MEDIUM", cls: "bg-opYellow/30 border-ink text-ink" },
                  { range: "50–74", label: "HIGH RISK", cls: "bg-[#FED7AA] border-ink text-ink" },
                  { range: "75–100", label: "CRITICAL", cls: "bg-opRed/20 border-opRed text-opRed" },
                ].map(({ range, label, cls }) => (
                  <div key={label} className={`rounded-xl border-2 p-2 font-black ${cls}`}>
                    <div className="text-base">{range}</div>
                    <div className="text-[9px] mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </Sub>
            <Sub title="Risk factors">
              <div className="space-y-1.5">
                {[
                  { label: "Owner/admin key present", points: "+25 pts", risky: true },
                  { label: "Can mint more supply", points: "+40 pts", risky: true },
                  { label: "Can pause transfers", points: "+15 pts", risky: true },
                  { label: "Can upgrade contract logic", points: "+25 pts", risky: true },
                  { label: "Privileged controls without timelocks", points: "+15 pts", risky: true },
                  { label: "Build hash recorded (transparency)", points: "−10 pts", risky: false },
                ].map(({ label, points, risky }) => (
                  <div key={label} className={`flex justify-between items-center rounded-lg border-2 px-3 py-1.5 text-xs ${risky ? "bg-opRed/5 border-opRed/20" : "bg-opGreen/5 border-opGreen/20"}`}>
                    <span className="font-semibold text-ink">{label}</span>
                    <span className={`font-black ${risky ? "text-opRed" : "text-opGreen"}`}>{points}</span>
                  </div>
                ))}
              </div>
            </Sub>
            <InfoBox color="green">
              ✓ All OpStreet default templates score <strong>0/100 (LOW RISK)</strong> because they have no admin
              keys, no mint, no pause, and no upgrade mechanism.
            </InfoBox>
          </Section>

          {/* SECURITY CHECKS */}
          <Section id="security-checks" title="Security Checks">
            <p>
              Clicking <strong className="text-ink">"Run Security Checks"</strong> triggers a two-phase pipeline
              powered by <strong className="text-ink">Bob AI</strong> (OP_NET's AI assistant):
            </p>
            <Sub title="Phase 1 — Scaffold (SCAFFOLD check run)">
              <p>
                Bob generates your OP_20 contract in AssemblyScript using the fixed-supply template.
                The generated source code is hashed and stored as the <Code>buildHash</Code>.
                This ensures the contract is deterministic — the same inputs always produce the same hash.
              </p>
            </Sub>
            <Sub title="Phase 2 — Audit (AUDIT check run)">
              <p>
                Bob audits the generated contract for security issues. The audit checks for:
                mint functions, admin keys, pause mechanisms, upgrade patterns, reentrancy, and more.
                Results are stored as the <Code>riskCard</Code> JSON and a numeric <Code>riskScore</Code>.
              </p>
            </Sub>
            <Sub title="Status transitions">
              <div className="flex flex-wrap gap-2 text-xs font-black">
                {["DRAFT", "→", "CHECKING", "→", "READY", "(or FLAGGED on error)"].map((s, i) => (
                  <span key={i} className={s.startsWith("→") || s.startsWith("(") ? "text-[var(--text-muted)]" : "op-panel px-2 py-1 text-ink"}>
                    {s}
                  </span>
                ))}
              </div>
            </Sub>
            <InfoBox>
              ⏱ Checks typically take 15–60 seconds. The page polls automatically and updates
              the Risk Card when complete. You can leave the page and come back.
            </InfoBox>
          </Section>

          {/* LAUNCH PIPELINE */}
          <Section id="launch-pipeline" title="Launch Pipeline">
            <p>
              OpStreet no longer uses a pre-launch interest gate. A token becomes tradable only after
              the wallet-signed deploy and pool creation steps are confirmed on OP_NET testnet.
            </p>
            <Sub title="Live launch sequence">
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>Run checks until the project reaches <Code>READY</Code></li>
                <li>Start <Code>launch-build</Code> to prepare the deploy artifact</li>
                <li>Submit the deploy transaction from your wallet and wait for watcher confirmation</li>
                <li>Create the pool from your wallet and wait for on-chain confirmation</li>
                <li>Trading unlocks only after the project reaches <Code>LIVE</Code></li>
              </ul>
            </Sub>
            <Sub title="Live trading">
              <p>
                Once a token is live, pricing uses constant-product AMM quotes from indexed pool reserves.
                Candles, volume, and player stats all derive from confirmed trade fills.
              </p>
            </Sub>
          </Section>

          {/* TRADING FLOOR */}
          <Section id="trading-floor" title="Trading Floor">
            <p>
              The <strong className="text-ink">Trading Floor</strong> is OpStreet's live community hub.
              Think of it like a Bloomberg terminal crossed with a Discord server, but for OP_NET tokens.
            </p>
            <Sub title="Features">
              <CheckList items={[
                { pass: true, label: "Live presence — see who's on the floor right now" },
                { pass: true, label: "Avatars — pick an emoji avatar when you join" },
                { pass: true, label: "Callouts — post 280-char alpha signals with up/down reactions" },
                { pass: true, label: "Trollbox — real-time chat (3s cooldown, spam detection)" },
                { pass: true, label: "Ticker tape — top live projects ranked by indexed market activity" },
                { pass: true, label: "Chart panel — live OHLC candles from confirmed trade fills" },
                { pass: true, label: "Live trading — wallet-signed swaps against pool reserves" },
              ]} />
            </Sub>
            <Sub title="Joining the floor">
              <p>
                Connect your wallet, then visit <Link href="/floor" className="text-ink font-black underline hover:text-opGreen">the Floor</Link>.
                A modal will appear asking for your display name and avatar. Your presence is tracked
                for 5 minutes after your last heartbeat — if you close the tab, you leave automatically.
              </p>
            </Sub>
            <Sub title="Callout rules">
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li>Maximum 280 characters per callout</li>
                <li>2-hour cooldown between callouts (prevents spam)</li>
                <li>Up to 50 reactions per callout (UP or DOWN)</li>
                <li>Posting 10+ callouts unlocks the "Caller" avatar</li>
                <li>Posting 50+ callouts unlocks the "OG" avatar</li>
              </ul>
            </Sub>
          </Section>

          {/* WALLET */}
          <Section id="wallet" title="Wallet & Authentication">
            <Sub title="Supported wallets">
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { name: "Unisat", status: "Supported", note: "Best support, BIP-322 signing" },
                  { name: "OKX Wallet", status: "Supported", note: "Bitcoin tab, BIP-322 signing" },
                  { name: "OPNet Plugin", status: "Supported", note: "Native OP_NET wallet" },
                ].map(({ name, status, note }) => (
                  <div key={name} className="rounded-xl border-2 border-ink bg-[var(--cream)] p-3">
                    <p className="font-black text-ink text-sm">{name}</p>
                    <p className="text-[10px] font-bold text-opGreen">{status}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{note}</p>
                  </div>
                ))}
              </div>
            </Sub>
            <Sub title="Manual address (testnet)">
              <p>
                If you don't have a wallet extension, you can paste a testnet Bitcoin address
                directly. Manual mode lets you browse launch pages, but you cannot sign transactions
                or verify identity (no BIP-322 signing without a wallet).
              </p>
            </Sub>
            <Sub title="Verification (BIP-322)">
              <p>
                After connecting, click <strong className="text-ink">"Sign to verify"</strong> in the wallet dropdown.
                Your wallet signs a message with your private key (no funds moved). The backend verifies
                the signature and issues a session JWT cookie. Verification is required for:
              </p>
              <ul className="list-disc pl-5 text-xs space-y-0.5 mt-1">
                <li>Entering the Trading Floor</li>
                <li>Posting callouts and chat messages</li>
                <li>Running security checks (quota: 5/day per wallet)</li>
              </ul>
            </Sub>
            <Sub title="Disconnecting">
              <p>
                Click the wallet address button in the header → select "Disconnect".
                This clears your local session and logs you out of the API.
                Your token and floor data are preserved in the database.
              </p>
            </Sub>
          </Section>

          {/* TESTNET BUY */}
          <Section id="testnet-buy" title="Testnet Buy Flow">
            <InfoBox color="green">
              The live buy flow is active on OP_NET testnet. All trades use real pool reserves.
            </InfoBox>
            <p>
              Trading uses wallet-signed transactions against live liquidity pools:
            </p>
            <Sub title="How it works">
              <ol className="list-none space-y-3">
                {[
                  { n: "1", title: "Get testnet BTC", body: "Visit faucet.opnet.org to get 0.05 tBTC every 24 hours on OP_NET testnet." },
                  { n: "2", title: "Enter amount", body: "On the token page, enter how many sats you want to spend in the Buy panel." },
                  { n: "3", title: "Get a live quote", body: "OpStreet API returns a constant-product AMM quote from the live pool reserves, including price impact and fees." },
                  { n: "4", title: "Sign with wallet", body: "Your wallet extension (Unisat/OKX/OPNet) signs the swap transaction. No private key ever leaves your device." },
                  { n: "5", title: "Broadcast", body: "The signed transaction is broadcast to the OP_NET network and executed against the pool contract." },
                  { n: "6", title: "Confirmation", body: "The watcher confirms the trade on-chain. Your fill, candle data, and stats update automatically." },
                ].map(({ n, title, body }) => (
                  <li key={n} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-opYellow/50 text-[10px] font-black text-ink">{n}</span>
                    <div>
                      <p className="font-black text-ink text-sm">{title}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Sub>
            <Sub title="Useful links">
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "OP_NET Faucet", href: "https://faucet.opnet.org" },
                  { label: "OP_SCAN Explorer", href: "https://scan.opnet.org" },
                  { label: "Install OP_WALLET", href: "https://opnet.org/wallet" },
                  { label: "OP_NET Docs", href: "https://docs.opnet.org" },
                ].map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="op-btn-outline text-xs px-3 py-1.5"
                  >
                    {label} ↗
                  </a>
                ))}
              </div>
            </Sub>
          </Section>

          {/* FAQ */}
          <Section id="faq" title="FAQ">
            <div className="space-y-4">
              {[
                {
                  q: "Is this testnet or mainnet?",
                  a: "OpStreet currently runs on OP_NET testnet. All trading uses live pool reserves and confirmed on-chain data. Mainnet support with real BTC is planned for Phase 5.",
                },
                {
                  q: "What is OP_NET?",
                  a: "OP_NET is a Bitcoin Layer 2 that enables EVM-compatible smart contracts via Ordinals. Contracts are written in AssemblyScript and compiled to WebAssembly (WASM). OP_20 is the OP_NET equivalent of ERC-20.",
                },
                {
                  q: "Why does my floor join fail?",
                  a: "Connect your wallet via the header button first. You need a wallet address set to enter the floor. If you're using a wallet extension, try signing to verify your identity first.",
                },
                {
                  q: "Why do security checks take so long?",
                  a: "Security checks call Bob AI (OP_NET's AI assistant) twice — once to scaffold the contract and once to audit it. Each call can take 10–30 seconds. The page polls automatically.",
                },
                {
                  q: "What is the 'buildHash'?",
                  a: "The buildHash is a SHA-256 hash of the generated AssemblyScript source code. It serves as a tamper-evident record. If the deployed contract matches this hash, it's marked as 'Artifact Verified'.",
                },
                {
                  q: "When will mainnet be available?",
                  a: "Mainnet support is planned for Phase 5. Graduated tokens with proven testnet activity will be considered for mainnet migration.",
                },
                {
                  q: "How do I get a testnet wallet?",
                  a: "Install Unisat Wallet or OKX Wallet browser extension. Switch to Bitcoin Testnet or OP_NET Testnet in the wallet settings. Then get testnet BTC from faucet.opnet.org.",
                },
              ].map(({ q, a }) => (
                <div key={q} className="rounded-xl border-2 border-ink/20 bg-[var(--cream)] px-4 py-3">
                  <p className="font-black text-ink text-sm mb-1">{q}</p>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ROADMAP */}
          <Section id="roadmap" title="Roadmap">
            <div className="space-y-3">
              {[
                { phase: "Phase 1", title: "Core Launchpad", status: "done", items: ["Token creation form", "OP_20 contract scaffolding", "Bob AI security audit", "Risk Card generation", "Wallet-native launch states"] },
                { phase: "Phase 2", title: "Community & Discovery", status: "done", items: ["Trading Floor (live presence + chat + callouts)", "Trending page", "Achievement badges", "Neo-brutalism UI reskin"] },
                { phase: "Phase 3", title: "Polish & Deploy", status: "done", items: ["Watchtower monitoring", "BIP-322 wallet authentication", "Mobile-responsive design", "Dark/light theme toggle"] },
                { phase: "Phase 4", title: "Live Testnet Trading", status: "done", items: ["Wallet-native deploy + pool creation", "Live pool trading (wallet-signed swaps)", "Market indexer (candles, fills, volume)", "OP721 shop collection"] },
                { phase: "Phase 5", title: "Mainnet & AMM", status: "future", items: ["OP_NET mainnet support", "AMM graduation (PumpSwap equivalent)", "Cross-chain bridge support", "Token staking rewards"] },
              ].map(({ phase, title, status, items }) => (
                <div key={phase} className={`op-panel p-4 ${status === "done" ? "border-opGreen bg-opGreen/5" : status === "active" ? "border-opYellow bg-opYellow/10" : "border-ink/20"}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border-2 ${status === "done" ? "bg-opGreen/20 border-opGreen text-opGreen" : status === "active" ? "bg-opYellow border-ink text-ink" : "bg-ink/5 border-ink/20 text-[var(--text-muted)]"}`}>
                      {status === "done" ? "✓ DONE" : status === "active" ? "IN PROGRESS" : "PLANNED"}
                    </span>
                    <div>
                      <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider">{phase}</span>
                      <p className="font-black text-ink text-sm">{title}</p>
                    </div>
                  </div>
                  <ul className="space-y-0.5">
                    {items.map((item) => (
                      <li key={item} className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                        <span className={status === "done" ? "text-opGreen" : status === "active" ? "text-opYellow" : "text-[var(--text-muted)]"}>
                          {status === "done" ? "✓" : status === "active" ? "◑" : "○"}
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
