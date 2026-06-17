export function detectAssetLabel(unameSM: string): string {
  const s = unameSM.trim();
  if (s === "Darwin arm64")                          return "darwin-arm64";
  if (s === "Darwin x86_64")                         return "darwin-x64";
  if (s === "Linux x86_64")                          return "linux-x64";
  if (s === "Linux aarch64" || s === "Linux arm64")  return "linux-arm64";
  throw new Error(
    `Unsupported platform: "${s}". Supported: Darwin/Linux × arm64/x86_64.`
  );
}
