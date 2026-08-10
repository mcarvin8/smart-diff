# Changelog

## [4.0.1](https://github.com/mcarvin8/smart-diff/compare/v4.0.0...v4.0.1) (2026-08-10)


### Bug Fixes

* **deps:** pin specific dep versions ([#67](https://github.com/mcarvin8/smart-diff/issues/67)) ([4a1f04a](https://github.com/mcarvin8/smart-diff/commit/4a1f04ad8ce6d105e786fb34f73888b261f409e7))

## [4.0.0](https://github.com/mcarvin8/smart-diff/compare/v3.4.1...v4.0.0) (2026-08-10)


### ⚠ BREAKING CHANGES

* **git:** createGitClient is now async and returns a tsgit Repository handle instead of a `{ run(args) }` shell wrapper. buildDiffPathspecs, buildDiffShapingGitArgs, and parseDiffSummary are removed in favor of buildPathFilterPredicate, direct renderer options, and buildFileSummary/mergeFileSummariesByPath/summarizeFiles. Node engine requirement bumped to >=22.22.1 (tsgit's actual minimum).

### Features

* **git:** replace dugite with tsgit, own the unified-diff rendering ([#64](https://github.com/mcarvin8/smart-diff/issues/64)) ([bc538a3](https://github.com/mcarvin8/smart-diff/commit/bc538a386472a5e6c86f0bff3145d6ea62968ee1))

## [3.4.1](https://github.com/mcarvin8/smart-diff/compare/v3.4.0...v3.4.1) (2026-08-10)


### Bug Fixes

* **deps:** bump all ai-sdk deps ([#62](https://github.com/mcarvin8/smart-diff/issues/62)) ([be46543](https://github.com/mcarvin8/smart-diff/commit/be4654314535fa24107feb56a080563093f0f243))

## [3.4.0](https://github.com/mcarvin8/smart-diff/compare/v3.3.0...v3.4.0) (2026-08-10)


### Features

* add a smart-diff CLI ([#60](https://github.com/mcarvin8/smart-diff/issues/60)) ([feb6033](https://github.com/mcarvin8/smart-diff/commit/feb60330127ac69914cd0d1448d586fdedb5092d))

## [3.3.0](https://github.com/mcarvin8/smart-diff/compare/v3.2.0...v3.3.0) (2026-08-10)


### Features

* add map-reduce summarization for oversized diffs ([#57](https://github.com/mcarvin8/smart-diff/issues/57)) ([9b6c095](https://github.com/mcarvin8/smart-diff/commit/9b6c095f0c6cf1d7dce8abb1aef975fe72a2e558))
* add redactSecrets diff-shaping option ([#55](https://github.com/mcarvin8/smart-diff/issues/55)) ([b9b380d](https://github.com/mcarvin8/smart-diff/commit/b9b380d19c207f635200d8d66f7f670d57569cc7))
* add token usage reporting ([#59](https://github.com/mcarvin8/smart-diff/issues/59)) ([575825c](https://github.com/mcarvin8/smart-diff/commit/575825c3d8e2c6ffc6544b49b08b602be06ed5b8))
* make LLM call retry count configurable ([#58](https://github.com/mcarvin8/smart-diff/issues/58)) ([c62cd6d](https://github.com/mcarvin8/smart-diff/commit/c62cd6d152bde41988973dd454973c5f54158fd0))

## [3.2.0](https://github.com/mcarvin8/smart-diff/compare/v3.1.0...v3.2.0) (2026-06-30)


### Features

* **package:** bump minimum Node engine to 22 ([#49](https://github.com/mcarvin8/smart-diff/issues/49)) ([97d70cb](https://github.com/mcarvin8/smart-diff/commit/97d70cb0a15a6a00cd13555d49c32904a5eda74b))

## [3.1.0](https://github.com/mcarvin8/smart-diff/compare/v3.0.0...v3.1.0) (2026-06-17)


### Features

* **deps:** bump the ai-sdk group with 13 updates ([#47](https://github.com/mcarvin8/smart-diff/issues/47)) ([89b763b](https://github.com/mcarvin8/smart-diff/commit/89b763b5da716c40261e2b1ee2f36c68fd32041f))
* replace execFile git spawn with dugite bundled binary ([#44](https://github.com/mcarvin8/smart-diff/issues/44)) ([303450c](https://github.com/mcarvin8/smart-diff/commit/303450cfc2280448c48c1c4015aff3abf2d48ceb))

## [3.0.0](https://github.com/mcarvin8/smart-diff/compare/v2.4.0...v3.0.0) (2026-06-16)


### ⚠ BREAKING CHANGES

* make all AI provider packages optional dependencies ([#41](https://github.com/mcarvin8/smart-diff/issues/41))

### Features

* add LLM_TEMPERATURE env var for configurable sampling temperature ([#43](https://github.com/mcarvin8/smart-diff/issues/43)) ([10975ff](https://github.com/mcarvin8/smart-diff/commit/10975ff0f6a4f41d6f12ee04228342473f810b31))
* make all AI provider packages optional dependencies ([#41](https://github.com/mcarvin8/smart-diff/issues/41)) ([7503864](https://github.com/mcarvin8/smart-diff/commit/7503864f2876d439b5d3fb0fc0c3fd78f754c5d0))

## [2.4.0](https://github.com/mcarvin8/smart-diff/compare/v2.3.2...v2.4.0) (2026-06-16)


### Features

* expose binary flag on DiffFileSummary for binary files ([#40](https://github.com/mcarvin8/smart-diff/issues/40)) ([19a32aa](https://github.com/mcarvin8/smart-diff/commit/19a32aa1bec6211b962ac0b929e1c87babeb21b1))
* update Anthropic default model and add Bedrock auto-detection ([#38](https://github.com/mcarvin8/smart-diff/issues/38)) ([993c7cf](https://github.com/mcarvin8/smart-diff/commit/993c7cf257bfaac18f39fbf64a83f3e9b8e19027))


### Bug Fixes

* timeout support, deterministic file order, Windows path escape ([#36](https://github.com/mcarvin8/smart-diff/issues/36)) ([d861946](https://github.com/mcarvin8/smart-diff/commit/d8619465e66ee72cf83a737b2d52bfd4ab9415dc))

## [2.3.2](https://github.com/mcarvin8/smart-diff/compare/v2.3.1...v2.3.2) (2026-06-11)


### Bug Fixes

* correct numstat rename lookup, stale error msg, redundant path check ([#32](https://github.com/mcarvin8/smart-diff/issues/32)) ([c822fbe](https://github.com/mcarvin8/smart-diff/commit/c822fbe8dc5a7cae0e53c4e1c33cd4e4d7e82b7e))

## [2.3.1](https://github.com/mcarvin8/smart-diff/compare/v2.3.0...v2.3.1) (2026-06-11)


### Bug Fixes

* honor OPENAI_MAX_DIFF_CHARS fallback ([#26](https://github.com/mcarvin8/smart-diff/issues/26)) ([ceac835](https://github.com/mcarvin8/smart-diff/commit/ceac83517e8157634f831918eb55a86c45738c0d))

## [2.3.0](https://github.com/mcarvin8/smart-diff/compare/v2.2.1...v2.3.0) (2026-06-03)


### Features

* **ai:** bump the ai-sdk group with 14 updates ([#24](https://github.com/mcarvin8/smart-diff/issues/24)) ([55e4738](https://github.com/mcarvin8/smart-diff/commit/55e47384cf61f00b02cf173b252c1ee78a86c27c))

## [2.2.1](https://github.com/mcarvin8/smart-diff/compare/v2.2.0...v2.2.1) (2026-05-26)


### Bug Fixes

* **deps:** pin direct dependencies to exact versions ([#21](https://github.com/mcarvin8/smart-diff/issues/21)) ([8242cd2](https://github.com/mcarvin8/smart-diff/commit/8242cd2cd858fb890ea46db104ad4c08a696a76d))

## [2.2.0](https://github.com/mcarvin8/smart-diff/compare/v2.1.0...v2.2.0) (2026-05-02)


### Features

* **ai:** bump the ai-sdk group with 14 updates ([#19](https://github.com/mcarvin8/smart-diff/issues/19)) ([7772e54](https://github.com/mcarvin8/smart-diff/commit/7772e5477ea6404494c2c367b6006e89dd7a8cd3))

## [2.1.0](https://github.com/mcarvin8/smart-diff/compare/v2.0.0...v2.1.0) (2026-04-23)


### Features

* **git:** add unified-diff token-reduction controls ([#16](https://github.com/mcarvin8/smart-diff/issues/16)) ([cf90d99](https://github.com/mcarvin8/smart-diff/commit/cf90d99bf01ebc55095cf2c35fd62057233956f9))


### Bug Fixes

* **quality:** remove dead code and hit test coverage ([79ef8f8](https://github.com/mcarvin8/smart-diff/commit/79ef8f811a9bd4e9e3b92e61eabb6325b18a6e6e))

## [2.0.0](https://github.com/mcarvin8/smart-diff/compare/v1.1.0...v2.0.0) (2026-04-21)


### ⚠ BREAKING CHANGES

* **ai:** removes `openAiClientProvider` and `OpenAiLikeClient` from the public API; use `llmModelProvider` with a Vercel AI SDK `LanguageModel` instead.

### Features

* **ai:** migrate core to Vercel AI SDK ([#13](https://github.com/mcarvin8/smart-diff/issues/13)) ([90fb408](https://github.com/mcarvin8/smart-diff/commit/90fb40870f537ad9ea2d9d41001c8c7871cea580))

## [1.1.0](https://github.com/mcarvin8/smart-diff/compare/v1.0.5...v1.1.0) (2026-04-15)


### Features

* **ai:** prepend truncation notice to summary when diff is capped ([#11](https://github.com/mcarvin8/smart-diff/issues/11)) ([5710a75](https://github.com/mcarvin8/smart-diff/commit/5710a7533de4ee0da8813f07323c8006b0e7bc08))

## [1.0.5](https://github.com/mcarvin8/smart-diff/compare/v1.0.4...v1.0.5) (2026-04-14)


### Bug Fixes

* **quality:** fix quality checks in ai folder ([#10](https://github.com/mcarvin8/smart-diff/issues/10)) ([ee311d9](https://github.com/mcarvin8/smart-diff/commit/ee311d9b4707730cef2f0c17b6fd0a0ae6fdafeb))
* **quality:** reduce overall complexity of git functions ([#8](https://github.com/mcarvin8/smart-diff/issues/8)) ([37814c6](https://github.com/mcarvin8/smart-diff/commit/37814c645d131ecad7c27f09efd4027037947454))

## [1.0.4](https://github.com/mcarvin8/smart-diff/compare/v1.0.3...v1.0.4) (2026-04-14)


### Bug Fixes

* **quality:** reduce total complexity in git diff ([#6](https://github.com/mcarvin8/smart-diff/issues/6)) ([a7d5a37](https://github.com/mcarvin8/smart-diff/commit/a7d5a3751a650bfa35cdec9f963230e495fec8be))

## [1.0.3](https://github.com/mcarvin8/smart-diff/compare/v1.0.2...v1.0.3) (2026-04-13)


### Bug Fixes

* packing  steps ([356f2e0](https://github.com/mcarvin8/smart-diff/commit/356f2e0920e48406a72befd4da3b0146074a419b))

## [1.0.2](https://github.com/mcarvin8/smart-diff/compare/v1.0.1...v1.0.2) (2026-04-13)


### Bug Fixes

* recreate lock file and fix links in readme ([4e762c6](https://github.com/mcarvin8/smart-diff/commit/4e762c680ee152bc8ef997926730e9a50a44541e))

## [1.0.1](https://github.com/mcarvin8/smart-diff/compare/v1.0.0...v1.0.1) (2026-04-13)


### Bug Fixes

* add Git Bash to requirements in README ([72d3d5e](https://github.com/mcarvin8/smart-diff/commit/72d3d5ea287d0c5e6e2f43c94b276dde960fec7c))
* regenerate lock file ([e76e111](https://github.com/mcarvin8/smart-diff/commit/e76e1113ec73d2646a9594dc55d0102eb89fe187))

## 1.0.0 (2026-04-13)


### Features

* init commit ([300a10b](https://github.com/mcarvin8/git-diff-ai/commit/300a10b1b19fe87021b7323b5a43925ada38db23))
