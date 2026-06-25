#!/usr/bin/env npx tsx
/**
 * Gemini CLI wrapper for PPT Agent.
 * Calls `gemini` in non-interactive (headless) mode with fallback model support.
 *
 * Usage:
 *   npx tsx invoke-gemini-ppt.ts --prompt <prompt> [--image <path>] [--role <role>] [--model <model>] [--output <path>]
 *
 * Output behavior:
 *   --output <path>  Write Gemini response to file (recommended for programmatic use)
 *   Without --output, prints to stdout
 */

import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

interface Args {
  role: string;
  prompt: string;
  image: string;
  model: string;
  output: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FALLBACK_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    role: "reviewer",
    prompt: "",
    image: "",
    model: "",
    output: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (current === "--role") args.role = argv[++i] || "reviewer";
    else if (current === "--prompt") args.prompt = argv[++i] || "";
    else if (current === "--image") args.image = argv[++i] || "";
    else if (current === "--model") args.model = argv[++i] || "";
    else if (current === "--output") args.output = argv[++i] || "";
    else if (current === "--help" || current === "-h") {
      console.log(
        "Usage: npx tsx invoke-gemini-ppt.ts --prompt <prompt> [--image <path>] [--role <role>] [--model <model>] [--output <path>]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${current}`);
    }
  }
  if (!args.prompt.trim()) throw new Error("--prompt is required");
  if (args.image && !existsSync(args.image))
    throw new Error(`Image file not found: ${args.image}`);
  return args;
}

function readLocalRolePrompt(role: string): string | null {
  if (!role) return null;
  const localPath = resolve(__dirname, "../references/roles", `${role}.md`);
  return existsSync(localPath) ? readFileSync(localPath, "utf-8").trim() : null;
}

function tryGemini(
  finalPrompt: string,
  image: string,
  model: string,
): { success: boolean; stdout: string; stderr: string } {
  const args = ["-p", finalPrompt, "--approval-mode", "plan", "-o", "text"];
  if (image) args.push("-i", image);
  if (model) args.push("--model", model);

  const modelLabel = model || "default";
  console.error(`[ppt-agent:gemini-cli] trying model=${modelLabel}`);

  const result = spawnSync("gemini", args, {
    stdio: ["inherit", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  });

  const stdout = result.stdout?.toString("utf-8") ?? "";
  const stderr = result.stderr?.toString("utf-8") ?? "";

  if (result.error) {
    console.error(`[ppt-agent:gemini-cli] spawn error: ${result.error.message}`);
    return { success: false, stdout, stderr };
  }

  if (result.status !== 0) {
    const is429 = stderr.includes("429") || stderr.includes("CAPACITY") || stderr.includes("EXHAUSTED");
    console.error(
      `[ppt-agent:gemini-cli] model=${modelLabel} failed (status=${result.status}${is429 ? ", 429 capacity" : ""})`,
    );
    return { success: false, stdout, stderr };
  }

  // Treat empty stdout as failure — Gemini sometimes exits 0 with no output
  if (!stdout.trim()) {
    console.error(`[ppt-agent:gemini-cli] model=${modelLabel} returned empty output`);
    return { success: false, stdout, stderr };
  }

  return { success: true, stdout, stderr };
}

function run(): void {
  const parsed = parseArgs(process.argv.slice(2));
  const rolePrompt = readLocalRolePrompt(parsed.role);
  const finalPrompt = rolePrompt
    ? `${rolePrompt}\n\n---\n\n${parsed.prompt}`.trim()
    : parsed.prompt;

  console.error(
    `[ppt-agent:gemini-cli] role=${parsed.role} image=${parsed.image || "none"}`,
  );

  // Build model attempt order: explicit model first, then fallbacks
  const models: string[] = [];
  if (parsed.model) {
    models.push(parsed.model);
  } else {
    models.push(""); // default model
  }
  models.push(...FALLBACK_MODELS);

  let lastResult: { success: boolean; stdout: string; stderr: string } | null = null;

  for (const model of models) {
    lastResult = tryGemini(finalPrompt, parsed.image, model);
    if (lastResult.success) {
      // Write output
      if (parsed.output) {
        mkdirSync(dirname(resolve(parsed.output)), { recursive: true });
        writeFileSync(parsed.output, lastResult.stdout, "utf-8");
        console.error(`[ppt-agent:gemini-cli] output written to ${parsed.output}`);
      } else {
        process.stdout.write(lastResult.stdout);
      }
      return;
    }
  }

  // All models failed
  const errorMsg = [
    `All Gemini models failed.`,
    `Models tried: ${models.map((m) => m || "default").join(", ")}`,
    `Last stderr: ${lastResult?.stderr?.slice(0, 500) ?? "none"}`,
  ].join("\n");

  console.error(`[ppt-agent:gemini-cli] ${errorMsg}`);
  process.exit(2); // Exit code 2 = all models failed, caller should fallback
}

try {
  run();
} catch (error) {
  console.error(`Error: ${(error as Error).message}`);
  process.exit(1);
}
