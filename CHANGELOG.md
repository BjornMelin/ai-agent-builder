# Changelog

## [0.1.4](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.3...ai-agent-builder-v0.1.4) (2026-02-03)


### Features

* **ai:** add gateway provider and vector retrieval ([8096d88](https://github.com/BjornMelin/ai-agent-builder/commit/8096d8818583eddbffd7d93562a8aa39f10b1289))
* align architecture and env config with Neon Postgres and Fluid compute stack ([809a4b7](https://github.com/BjornMelin/ai-agent-builder/commit/809a4b7dc23b1e8c65c0bd2e2b6f3bae9ebda9b2))
* **api:** add upload, search, run jobs ([5d3529a](https://github.com/BjornMelin/ai-agent-builder/commit/5d3529af1435a4baa1bec8fb737d5d958d353647))
* **api:** enhance run management and file upload processes ([7899f94](https://github.com/BjornMelin/ai-agent-builder/commit/7899f9434047dabc84ade01a801f99f892253a6e))
* **api:** enhance upload and ingestion processes with parallel handling and testing ([ad63562](https://github.com/BjornMelin/ai-agent-builder/commit/ad63562b9ea6e1e2e46d29ca94cffda2c738abed))
* **data:** add project, file, run accessors ([fb09a56](https://github.com/BjornMelin/ai-agent-builder/commit/fb09a5605122863ff15d4f2b739a7e0bcfc0a2b4))
* **db:** add schema, client, migrations ([8f4d379](https://github.com/BjornMelin/ai-agent-builder/commit/8f4d379a316e6572eb5122df1c3db834f50db71f))
* **env:** add APP_BASE_URL for server callbacks and update related documentation ([e9b3414](https://github.com/BjornMelin/ai-agent-builder/commit/e9b341422588bec8d61ad8ff6964668dcaef43cb))
* **ingest:** add document extraction pipeline ([af3baf6](https://github.com/BjornMelin/ai-agent-builder/commit/af3baf6ab1e557308ae2975246609aebcedb2d8d))
* update AI Gateway model IDs and enhance environment configuration ([f428e31](https://github.com/BjornMelin/ai-agent-builder/commit/f428e31355e6f0c08db6491bb92e76528e9b9c81))


### Bug Fixes

* **docs:** punctuate QStash list ([50cc08a](https://github.com/BjornMelin/ai-agent-builder/commit/50cc08af80c1af52881ee3a1feb95a23d0d08882))
* **docs:** update references and formatting in CI/CD and runbook documentation ([e61a29d](https://github.com/BjornMelin/ai-agent-builder/commit/e61a29d6af26dd79d8ab2a748fd7bb411e9c80b0))
* **pr-10:** address review feedback ([8847cf9](https://github.com/BjornMelin/ai-agent-builder/commit/8847cf90c66ee430966ecfa1aebad154feabd227))
* **pr:** resolve review comments for PR [#10](https://github.com/BjornMelin/ai-agent-builder/issues/10) ([2f61f52](https://github.com/BjornMelin/ai-agent-builder/commit/2f61f52cb3df85fdaea12d75157681ce1d412ecd))
* **review:** address PR comments ([0202f06](https://github.com/BjornMelin/ai-agent-builder/commit/0202f06c0138c0de55f4e9cd1a5fd87d431f58d2))
* **review:** resolve PR 10 comments ([24f5c35](https://github.com/BjornMelin/ai-agent-builder/commit/24f5c3585e16979e832ff1da664c88e0d9b1734b))
* **tests:** format expectation for AI Gateway base URL in env tests ([1487481](https://github.com/BjornMelin/ai-agent-builder/commit/1487481699975532af3a958fe747c41b3d7d6501))

## [0.1.3](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.2...ai-agent-builder-v0.1.3) (2026-02-03)


### Bug Fixes

* **ci:** enforce ubuntu-latest for scorecard ([af278ae](https://github.com/BjornMelin/ai-agent-builder/commit/af278aee4bcc428363dbc4788790b7d12655b7e5))
* **ci:** enforce ubuntu-latest for scorecard ([3a43fee](https://github.com/BjornMelin/ai-agent-builder/commit/3a43fee3ec2b0ff81be320c9ddabd3cd7092a4d6))

## [0.1.2](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.1...ai-agent-builder-v0.1.2) (2026-02-03)


### Features

* add @edge-runtime/primitives, @edge-runtime/vm, and tsx dependencies to bun.lock. ([3500202](https://github.com/BjornMelin/ai-agent-builder/commit/35002020fa4851d0e75ce60adf3e1ca109c9f12f))
* add GitHub, Vercel, Neon, and Upstash environment schemas with validation and access methods ([850b406](https://github.com/BjornMelin/ai-agent-builder/commit/850b40672852fdecbae290d121affb6ac3a1edc9))
* add Neon Auth proxy middleware, enhance global styles, and implement access control pages ([058caaf](https://github.com/BjornMelin/ai-agent-builder/commit/058caafc8d99e94fa981a2349927909afefdf6aa))
* add new authentication, UI, and captcha dependencies, update `ai` package, and disable Biome key sorting for `package.json`. ([694560a](https://github.com/BjornMelin/ai-agent-builder/commit/694560a231e0c9b9fe112e08b2127ec0628aec8a))
* **auth:** enhance environment configuration for social login and update documentation ([f271dd1](https://github.com/BjornMelin/ai-agent-builder/commit/f271dd196c42260412e1338f5d2c0aafe1a82627))
* **auth:** introduce AUTH_SOCIAL_PROVIDERS for configurable social login options and update related documentation ([a30ca55](https://github.com/BjornMelin/ai-agent-builder/commit/a30ca55a024eebcf7c730d5bfdc86049e42a3343))
* **ci:** implement Vercel Preview automation with Neon branch provisioning ([764f58e](https://github.com/BjornMelin/ai-agent-builder/commit/764f58e323f770514637b08be351313e8e9ef208))
* **ci:** streamline Vercel Preview automation with Neon Auth trusted domains ([f99ddbe](https://github.com/BjornMelin/ai-agent-builder/commit/f99ddbec286bc8219fd8c373034c11f4fd8186b0))
* enhance Vercel Sandbox environment configuration with new auth modes and validation, updating related documentation and tests ([684d832](https://github.com/BjornMelin/ai-agent-builder/commit/684d83275f603c0e298b8327f904d54fc9fd836b))
* export normalizeEmail function and add tests for restricted user email handling in access control ([6898363](https://github.com/BjornMelin/ai-agent-builder/commit/6898363698c8f9aa2e2aead2fb5c025067c5be35))
* implement Neon Auth integration with client-side providers, account management routes, and access control enforcement ([14f8154](https://github.com/BjornMelin/ai-agent-builder/commit/14f815410d6d0606e8e53995f275750afcf092d8))
* integrate @vercel/analytics for enhanced tracking and update project description ([93cee24](https://github.com/BjornMelin/ai-agent-builder/commit/93cee245058ada283d014072d613b2e62aa3b43b))
* **platform:** add typed env and server foundation utilities ([5851132](https://github.com/BjornMelin/ai-agent-builder/commit/58511320a2767f1e670c6ed6af5f30128799c307))
* scaffold platform foundations + env + Neon Auth + Neon DB ([432b22f](https://github.com/BjornMelin/ai-agent-builder/commit/432b22f75cbc28ba5dbd56e0c83f1fbc8815bc4f))


### Bug Fixes

* **ci:** improve error handling in Neon Auth workflow ([c2cfa0d](https://github.com/BjornMelin/ai-agent-builder/commit/c2cfa0d8ae9d45afb4434247a286fce54bf149ef))
* **pr-review:** resolve review feedback ([5ddfb30](https://github.com/BjornMelin/ai-agent-builder/commit/5ddfb30704792303284b14fa3a0a6f32dada0408))
* **pr:** address review comments (PR [#5](https://github.com/BjornMelin/ai-agent-builder/issues/5)) ([b6759c6](https://github.com/BjornMelin/ai-agent-builder/commit/b6759c652506f69c1d39f70c36d58b3f710fea9d))

## [0.1.1](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.0...ai-agent-builder-v0.1.1) (2026-01-30)

### Features

* document `argon2` build prerequisites and configure CI setup for them, update CI/CD spec requirements, and fix accessibility typo. ([2a59402](https://github.com/BjornMelin/ai-agent-builder/commit/2a594020951e19f77f06a20842b880115b07e94d))
* scaffold app router UI ([aa7e938](https://github.com/BjornMelin/ai-agent-builder/commit/aa7e938820911229913efa304673901f528be3d2))

### Bug Fixes

* **pr-review:** resolve CodeRabbit comments ([06feed0](https://github.com/BjornMelin/ai-agent-builder/commit/06feed03507da11842ec28bffc092c169b145090))
* **vitest:** extend excludes with defaults ([41e029c](https://github.com/BjornMelin/ai-agent-builder/commit/41e029c827d4c8c7a23f94044b40b1346f401d2d))
