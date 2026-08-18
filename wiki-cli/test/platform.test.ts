import { expect, test } from "bun:test";
import { detectAssetLabel } from "../src/platform.js";

test("darwin arm64", () => {
  expect(detectAssetLabel("Darwin arm64")).toBe("darwin-arm64");
});
test("darwin x64", () => {
  expect(detectAssetLabel("Darwin x86_64")).toBe("darwin-x64");
});
test("linux x64", () => {
  expect(detectAssetLabel("Linux x86_64")).toBe("linux-x64");
});
test("linux aarch64", () => {
  expect(detectAssetLabel("Linux aarch64")).toBe("linux-arm64");
});
test("linux arm64 (alternate uname output)", () => {
  expect(detectAssetLabel("Linux arm64")).toBe("linux-arm64");
});
test("trims surrounding whitespace", () => {
  expect(detectAssetLabel("  Darwin arm64  ")).toBe("darwin-arm64");
});
test("unsupported platform throws with message", () => {
  expect(() => detectAssetLabel("Windows x86_64")).toThrow("Unsupported platform");
});
