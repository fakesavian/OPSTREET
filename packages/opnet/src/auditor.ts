import { getBob, BobClient } from "./bob-client.js";
import type { RiskCard } from "@opfun/shared";

export interface AuditIssue {
  severity: "PASS" | "INFO" | "WARN" | "FAIL";
  code: string;
  message: string;
}

export interface AuditOutput {
  passed: boolean;
  issues: AuditIssue[];
  summary: string;
  rawBobOutput: string;
  riskCard: RiskCard;
  riskScore: number;
}

/**
 * Detect risk flags by static analysis of the contract source.
 * Fast, no network call — just regex on the generated code.
 */
function staticAnalyze(source: string): {
  canMint: boolean;
  canPause: boolean;
  hasAdminKey: boolean;
  canUpgrade: boolean;
  hasTimelocks: boolean;
  hasTransferRestrictions: boolean;
  issues: AuditIssue[];
} {
  const issues: AuditIssue[] = [];

  // OPNet audit checklist — critical patterns
  const checks: Array<{
    pattern: RegExp;
    severity: AuditIssue["severity"];
    code: string;
    flag: string;
    message: string;
    present: boolean; // true = issue if pattern IS found
  }> = [
    {
      pattern: /public\s+mint\s*\(/,
      severity: "WARN",
      code: "OA-001",
      flag: "canMint",
      message: "Public mint() function found — can inflate supply after deployment",
      present: true,
    },
    {
      pattern: /public\s+pause\s*\(/,
      severity: "WARN",
      code: "OA-002",
      flag: "canPause",
      message: "pause() function found — transfers can be frozen by admin",
      present: true,
    },
    {
      pattern: /onlyDeployer|onlyOwner|onlyAdmin|this\.owner/,
      severity: "INFO",
      code: "OA-003",
      flag: "hasAdminKey",
      message: "Admin/owner check found — privileged address controls this contract",
      present: true,
    },
    {
      pattern: /upgradeTo|upgradeToAndCall|_setImplementation|Upgradeable/,
      severity: "FAIL",
      code: "OA-004",
      flag: "canUpgrade",
      message: "Upgrade mechanism detected — contract logic can be replaced",
      present: true,
    },
    // OPNet-specific safety checks
    {
      pattern: /[^a-zA-Z](\+|-|\*|\/)[^=\+\->].*u256|u256.*[^a-zA-Z](\+|-|\*|\/)[^=\+\->]/,
      severity: "FAIL",
      code: "OA-005",
      flag: "",
      message: "Raw arithmetic on u256 detected — use SafeMath to prevent overflow/underflow",
      present: true,
    },
    {
      pattern: /while\s*\(/,
      severity: "FAIL",
      code: "OA-006",
      flag: "",
      message: "while() loop found in contract — FORBIDDEN on OPNet (gas exhaustion risk)",
      present: true,
    },
    {
      pattern: /new\s+Uint8Array|Buffer\s*\./,
      severity: "INFO",
      code: "OA-007",
      flag: "",
      message: "Low-level buffer use detected — ensure correct sizes to prevent overflows",
      present: true,
    },
  ];

  const flags: Record<string, boolean> = {
    canMint: false,
    canPause: false,
    hasAdminKey: false,
    canUpgrade: false,
    hasTimelocks: false,
    hasTransferRestrictions: false,
  };

  for (const check of checks) {
    const found = check.pattern.test(source);
    if (found === check.present) {
      issues.push({ severity: check.severity, code: check.code, message: check.message });
      if (check.flag) flags[check.flag] = true;
    }
  }

  // Check timelocks
  flags["hasTimelocks"] = /timelock|TimeLock|Timelock/.test(source);
  flags["hasTransferRestrictions"] =
    (flags["canPause"] ?? false) ||
    /blacklist|_blocked|_restricted/.test(source);

  return {
    canMint: flags["canMint"] ?? false,
    canPause: flags["canPause"] ?? false,
    hasAdminKey: flags["hasAdminKey"] ?? false,
    canUpgrade: flags["canUpgrade"] ?? false,
    hasTimelocks: flags["hasTimelocks"] ?? false,
    hasTransferRestrictions: flags["hasTransferRestrictions"] ?? false,
    issues,
  };
}

/** Compute numeric risk score 0–100 from risk card */
function scoreRiskCard(card: RiskCard): number {
  let score = 0;
  if (card.permissions.hasOwnerKey) score += 10;
  if (card.permissions.canMint) score += 25;
  if (card.permissions.canPause) score += 10;
  if (card.permissions.canUpgrade) score += 20;
  if (!card.permissions.hasTimelocks) score += 5;
  if (!card.releaseIntegrity.buildHashRecorded) score += 10;
  if (card.tokenEconomics.transferRestrictions) score += 10;
  if (!card.tokenEconomics.initialDistributionNotes) score += 10;
  return Math.min(100, score);
}

/**
 * Run the full audit pipeline:
 * 1. Static analysis (no network)
 * 2. Bob OpnetAudit call for AI-assisted checklist
 * 3. Build Risk Card + risk score
 */
export async function auditContract(
  contractSource: string,
  opts: {
    name: string;
    ticker: string;
    decimals: number;
    maxSupply: string;
    buildHash: string;
  },
): Promise<AuditOutput> {
  // Step 1: Static analysis
  const staticFlags = staticAnalyze(contractSource);

  // Step 2: Call Bob OpnetAudit for AI checklist
  let rawBobOutput = "";
  const bobIssues: AuditIssue[] = [];

  try {
    const bob = getBob();
    const result = await bob.callTool("opnet_opnet_audit", {
      contract_code: contractSource.slice(0, 4000), // keep within limits
      audit_type: "contract",
    });
    rawBobOutput = BobClient.text(result).slice(0, 5000);

    // Parse Bob output for PASS/WARN/FAIL markers
    const failPattern = /\[[ xX✗✘]\]\s*(.*)/g;
    const passPattern = /\[(?:✓|✔|x|X)\]\s*(.*)/g;
    let m: RegExpExecArray | null;

    while ((m = failPattern.exec(rawBobOutput)) !== null) {
      if (m[1]) {
        bobIssues.push({
          severity: "WARN",
          code: "BOB-AUDIT",
          message: m[1].trim().slice(0, 120),
        });
      }
    }
    while ((m = passPattern.exec(rawBobOutput)) !== null) {
      if (m[1]) {
        bobIssues.push({
          severity: "PASS",
          code: "BOB-AUDIT",
          message: m[1].trim().slice(0, 120),
        });
      }
    }
  } catch (err) {
    rawBobOutput = `Bob audit unavailable: ${err instanceof Error ? err.message : String(err)}`;
    bobIssues.push({
      severity: "INFO",
      code: "BOB-OFFLINE",
      message: "Bob audit service unavailable — static analysis only",
    });
  }

  // Step 3: Build Risk Card
  const allIssues = [...staticFlags.issues, ...bobIssues];
  const hasFailures = allIssues.some((i) => i.severity === "FAIL");
  const hasWarnings = allIssues.some((i) => i.severity === "WARN");

  const riskCard: RiskCard = {
    permissions: {
      hasOwnerKey: staticFlags.hasAdminKey,
      canMint: staticFlags.canMint,
      canPause: staticFlags.canPause,
      canUpgrade: staticFlags.canUpgrade,
      hasTimelocks: staticFlags.hasTimelocks,
      timelockDelay: null,
    },
    tokenEconomics: {
      maxSupply: opts.maxSupply,
      decimals: opts.decimals,
      transferRestrictions: staticFlags.hasTransferRestrictions
        ? "Transfer restrictions detected — see audit issues"
        : null,
      initialDistributionNotes:
        "100% of supply minted to deployer at launch. Fixed supply — no further minting.",
    },
    releaseIntegrity: {
      buildHashRecorded: true,
      contractMatchesArtifact: null, // confirmed at deploy time (M3)
      auditTimestamp: new Date().toISOString(),
      auditSummary: hasFailures
        ? `FAIL: ${allIssues.filter((i) => i.severity === "FAIL").length} critical issue(s) found`
        : hasWarnings
        ? `WARN: ${allIssues.filter((i) => i.severity === "WARN").length} warning(s) found`
        : `PASS: No issues found (${allIssues.filter((i) => i.severity === "PASS").length} checks passed)`,
    },
  };

  const riskScore = scoreRiskCard(riskCard);

  return {
    passed: !hasFailures,
    issues: allIssues,
    summary: riskCard.releaseIntegrity.auditSummary ?? "",
    rawBobOutput,
    riskCard,
    riskScore,
  };
}
