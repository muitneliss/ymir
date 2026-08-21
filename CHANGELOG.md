# Changelog

## [0.8.0](https://github.com/muitneliss/ymir/compare/ymir-v0.7.0...ymir-v0.8.0) (2026-08-21)


### Features

* **wiki-cli:** self-report — capture failures and file them as GitHub issues ([#60](https://github.com/muitneliss/ymir/issues/60)) ([234e6d6](https://github.com/muitneliss/ymir/commit/234e6d619e59de6699c010af8e4d41df54ab4408))

## [0.7.0](https://github.com/muitneliss/ymir/compare/ymir-v0.6.0...ymir-v0.7.0) (2026-08-18)


### Features

* **ci:** add skills-install gate — smoke-test discovery, payload, and portability ([#53](https://github.com/muitneliss/ymir/issues/53)) ([3a6c840](https://github.com/muitneliss/ymir/commit/3a6c840eeb9bc5a6839bff85375849a49d59e452))
* **ci:** gate Ymir's own wiki health in CI and wire local drift hook ([#39](https://github.com/muitneliss/ymir/issues/39)) ([a561d57](https://github.com/muitneliss/ymir/commit/a561d57270f1af06f99ad64e76e5367efaabc64a))
* **skills:** make harness agent-aware — branch on target_agent for wiki, rules, and steering file ([#52](https://github.com/muitneliss/ymir/issues/52)) ([66a64c3](https://github.com/muitneliss/ymir/commit/66a64c3f07fe3cb3515ae54db7b274f39c35be72)), closes [#46](https://github.com/muitneliss/ymir/issues/46)
* **skills:** replace CLAUDE_PLUGIN_ROOT with skill-root-relative paths and self-provisioning ([#51](https://github.com/muitneliss/ymir/issues/51)) ([b2c72bf](https://github.com/muitneliss/ymir/commit/b2c72bf82e6603832a505c1c6e0fc5912ad46d0a))
* **skills:** trim installed skill payload by moving wiki-cli to repo root ([#55](https://github.com/muitneliss/ymir/issues/55)) ([5ad9383](https://github.com/muitneliss/ymir/commit/5ad9383783a9178817b60225e4c9e680878147ce))


### Bug Fixes

* **skills:** declare plugin skill in manifest so discovery is deterministic ([#50](https://github.com/muitneliss/ymir/issues/50)) ([88a3d06](https://github.com/muitneliss/ymir/commit/88a3d06990116785609b0d79ebcaca281470544f)), closes [#41](https://github.com/muitneliss/ymir/issues/41)

## [0.6.0](https://github.com/muitneliss/ymir/compare/ymir-v0.5.1...ymir-v0.6.0) (2026-08-18)


### Features

* **wiki-cli:** add declarative source coverage with reasoned exclusions ([#33](https://github.com/muitneliss/ymir/issues/33)) ([46390aa](https://github.com/muitneliss/ymir/commit/46390aa8df7b4808f73cebadd3499b086059e46c)), closes [#24](https://github.com/muitneliss/ymir/issues/24)
* **wiki-cli:** add first-class rename and delete lifecycle operations ([#34](https://github.com/muitneliss/ymir/issues/34)) ([c23c008](https://github.com/muitneliss/ymir/commit/c23c008c80870db62a8a9ac35b690c2592cf6b5d)), closes [#25](https://github.com/muitneliss/ymir/issues/25)
* **wiki-cli:** add wiki check command as single policy-aware CI gate ([#35](https://github.com/muitneliss/ymir/issues/35)) ([d40c6bd](https://github.com/muitneliss/ymir/commit/d40c6bd1a9e79a9d6c7762f909f911e6eadcd97d))


### Bug Fixes

* **wiki-cli:** correct help text and add --raw warning for project files ([#37](https://github.com/muitneliss/ymir/issues/37)) ([c91a0b2](https://github.com/muitneliss/ymir/commit/c91a0b28113849c2d2cc4d91add6c638560ded99)), closes [#30](https://github.com/muitneliss/ymir/issues/30)
* **wiki-cli:** make page identity collision-safe and prevent silent overwrites ([#27](https://github.com/muitneliss/ymir/issues/27)) ([edd42e5](https://github.com/muitneliss/ymir/commit/edd42e58c891c4ff5b55b79875e16f8cd098a6a8)), closes [#23](https://github.com/muitneliss/ymir/issues/23)
* **wiki:** bind all source pages to living-doc provenance and fix code-block link validation ([#36](https://github.com/muitneliss/ymir/issues/36)) ([c1233ba](https://github.com/muitneliss/ymir/commit/c1233ba41f7a3b4ab81b968f9ec0b21a067eea43))
* **wiki:** close source coverage gap and refresh stale notes ([#38](https://github.com/muitneliss/ymir/issues/38)) ([9c7f6d4](https://github.com/muitneliss/ymir/commit/9c7f6d4e7b0cb190216f584cea768750b47593cd)), closes [#31](https://github.com/muitneliss/ymir/issues/31)

## [0.5.1](https://github.com/muitneliss/ymir/compare/ymir-v0.5.0...ymir-v0.5.1) (2026-08-02)


### Bug Fixes

* **wiki-cli:** six retrieval defects, and answer accuracy 43% -&gt; 93% ([#21](https://github.com/muitneliss/ymir/issues/21)) ([18e1a97](https://github.com/muitneliss/ymir/commit/18e1a9748e6c5f85dcda1e5e863d5aebc6eeca48))

## [0.5.0](https://github.com/muitneliss/ymir/compare/ymir-v0.4.0...ymir-v0.5.0) (2026-06-18)


### Features

* **ymir:** add Socratic interview engine reference doc ([684446e](https://github.com/muitneliss/ymir/commit/684446e979b8359d662556264789adb47ab86709))
* **ymir:** apply handles .claude/rules directory target (per-file backup for revert) ([c79abd2](https://github.com/muitneliss/ymir/commit/c79abd24598314ad043e36b448e4031fbe86be14))
* **ymir:** codebase-first deep Socratic interview + native .claude/rules ([9d03da8](https://github.com/muitneliss/ymir/commit/9d03da8a8464741e5b3b99ba65455554b55aa77b))
* **ymir:** codebase-first Socratic interview (Steps 0-5, consistency + gates) ([79646f8](https://github.com/muitneliss/ymir/commit/79646f8c0a38af847df1fa8cdca7daad39e0d1e9))
* **ymir:** harness-profile schema v2 (why/findings/alternatives + rules.files[]) ([714d38e](https://github.com/muitneliss/ymir/commit/714d38efe59519255a5126bdfd4ce7ba58523c57))
* **ymir:** playbook Why/Findings blocks + rules targets .claude/rules/ ([020c91a](https://github.com/muitneliss/ymir/commit/020c91a3c4f536b1fb35d514b1da26cbf16bd6fa))

## [0.4.0](https://github.com/muitneliss/ymir/compare/ymir-v0.3.0...ymir-v0.4.0) (2026-06-18)


### Features

* **ymir:** reframe Ymir as a harness-spec generator ([#8](https://github.com/muitneliss/ymir/issues/8)) ([acb0487](https://github.com/muitneliss/ymir/commit/acb0487af9bcad2a2cfd972a9b9fff97579845a4))

## [0.3.0](https://github.com/muitneliss/ymir/compare/ymir-v0.2.0...ymir-v0.3.0) (2026-06-17)


### Features

* wiki auto-sync (provenance + drift detection) ([#13](https://github.com/muitneliss/ymir/issues/13)) ([017e729](https://github.com/muitneliss/ymir/commit/017e7290168e0fd765e7cafa651e03a7bfef9329))

## [0.2.0](https://github.com/muitneliss/ymir/compare/ymir-v0.1.0...ymir-v0.2.0) (2026-06-17)


### Features

* publish wiki CLI binaries to GitHub Releases with auto-fetch hook ([#4](https://github.com/muitneliss/ymir/issues/4)) ([00c09b3](https://github.com/muitneliss/ymir/commit/00c09b35ef80acd301f50ce548529dbfb08d6d3f))
