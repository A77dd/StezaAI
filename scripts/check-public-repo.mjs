import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_TEXT_FILE_BYTES = 1_000_000;

const rules = [
  {
    label: "private key",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    label: "GitHub token",
    pattern: /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  },
  {
    label: "AWS access key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    label: "OpenAI-style secret",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    label: "assigned secret",
    pattern:
      /\b(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|PRIVATE_KEY|SECRET_KEY)\s*[:=]\s*["']?[^\s"'${}]{8,}/i,
  },
  {
    label: "macOS home path",
    pattern: /\/Users\/[^/\s]+/,
  },
  {
    label: "Linux home path",
    pattern: /\/home\/[^/\s]+/,
  },
];

const fileNames = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const findings = [];

for (const fileName of fileNames) {
  const buffer = readFileSync(fileName);
  if (buffer.length > MAX_TEXT_FILE_BYTES || buffer.includes(0)) continue;

  const lines = buffer.toString("utf8").split("\n");
  lines.forEach((line, index) => {
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        findings.push(`${fileName}:${index + 1} ${rule.label}`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Public-repository safety scan failed:");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exitCode = 1;
} else {
  console.log(`Public-repository safety scan passed (${fileNames.length} files).`);
}
