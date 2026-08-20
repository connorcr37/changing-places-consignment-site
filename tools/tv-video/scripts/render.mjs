import { rmSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const remotionCli = path.join(
  sourceRoot,
  "node_modules",
  "@remotion",
  "cli",
  "remotion-cli.js",
);
const rawOutput = path.resolve(
  sourceRoot,
  "..",
  "..",
  "tv",
  "media",
  "screensaver-4k-hevc-raw.mp4",
);
const finalOutput = path.resolve(
  sourceRoot,
  "..",
  "..",
  "tv",
  "media",
  "screensaver-4k-hevc.mp4",
);
const fallbackOutput = path.resolve(
  sourceRoot,
  "..",
  "..",
  "tv",
  "media",
  "screensaver-4k-avc.mp4",
);

const runRemotion = (arguments_) => {
  const result = spawnSync(process.execPath, [remotionCli, ...arguments_], {
    cwd: sourceRoot,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

runRemotion([
  "render",
  "InStoreScreensaver",
  rawOutput,
  "--codec=h265",
  "--crf=24",
  "--pixel-format=yuv420p",
  "--color-space=bt709",
  "--gop=60",
  "--muted",
]);

runRemotion([
  "ffmpeg",
  "-hide_banner",
  "-y",
  "-i",
  rawOutput,
  "-map",
  "0:v:0",
  "-c",
  "copy",
  "-bsf:v",
  "hevc_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1",
  "-tag:v",
  "hvc1",
  "-movflags",
  "+faststart",
  finalOutput,
]);

runRemotion([
  "ffmpeg",
  "-hide_banner",
  "-y",
  "-i",
  finalOutput,
  "-map",
  "0:v:0",
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-profile:v",
  "high",
  "-level:v",
  "5.2",
  "-g",
  "60",
  "-keyint_min",
  "60",
  "-sc_threshold",
  "0",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-colorspace",
  "bt709",
  "-tag:v",
  "avc1",
  "-movflags",
  "+faststart",
  fallbackOutput,
]);

const cloudflareAssetLimit = 25 * 1024 * 1024;
const outputs = [finalOutput, fallbackOutput];

for (const output of outputs) {
  const outputSize = statSync(output).size;

  if (outputSize > cloudflareAssetLimit) {
    throw new Error(
      `Rendered video ${output} is ${outputSize} bytes, exceeding Cloudflare's 25 MiB static-asset limit.`,
    );
  }

  console.log(`Final video: ${output} (${outputSize} bytes)`);
}

rmSync(rawOutput);
