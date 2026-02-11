# Changelog

## [0.1.13](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.12...ai-agent-builder-v0.1.13) (2026-02-11)


### Features

* ai chat attachments and file uploads + Vercel blob handling ([8abf722](https://github.com/BjornMelin/ai-agent-builder/commit/8abf7227148257ca6df21acb3e3b9e63e2e895e6))
* **chat:** add document attachments support in Project Chat ([e114e27](https://github.com/BjornMelin/ai-agent-builder/commit/e114e27aa9c082a64b80be4f08b9b4a52ffd1c3a))
* **chat:** enhance file upload configuration ([4a51f5c](https://github.com/BjornMelin/ai-agent-builder/commit/4a51f5cfd6f1e535d56ca1b6f1f5615a26338e07))
* **chat:** enhance file upload validation and error handling ([d5f1151](https://github.com/BjornMelin/ai-agent-builder/commit/d5f115144cbd6844074fba1bf3b42373220c7ba6))
* **upload:** enhance upload path validation and error handling ([94de85d](https://github.com/BjornMelin/ai-agent-builder/commit/94de85dc664bff5a0ea437db8f631945581ceb27))
* **uploads:** blob client uploads + register/ingest endpoint ([bdfdb61](https://github.com/BjornMelin/ai-agent-builder/commit/bdfdb61e0223414c7424b1c4baea2fc805e8a8e8))


### Bug Fixes

* **attachments:** address PR review feedback ([dc30240](https://github.com/BjornMelin/ai-agent-builder/commit/dc3024043f9e2d03e315bde77a2eb68e62461cc2))
* **chat:** avoid duplicate composer error surfacing ([77a3939](https://github.com/BjornMelin/ai-agent-builder/commit/77a3939f0971524d3e93af56789d0c12f6c719bc))
* **chat:** validate marker file parts before rebuilding user message ([fad2b83](https://github.com/BjornMelin/ai-agent-builder/commit/fad2b831c4de905f9f38a777bdf75335d2ebeba7))
* **prompt-input:** prefer source File for data-url conversion ([332af5d](https://github.com/BjornMelin/ai-agent-builder/commit/332af5d333d8b80ed24109a0a28c148ea39660af))
* **upload:** address review nits ([c613d8c](https://github.com/BjornMelin/ai-agent-builder/commit/c613d8c5bbf3c961e8bacf93c52e5a2a46c48c9a))
* **uploads:** address PR review feedback ([58533e6](https://github.com/BjornMelin/ai-agent-builder/commit/58533e697a721f0da6c740a6b78d1367bb4be019))


### Performance Improvements

* **upload:** parallelize register and reduce revalidation ([cf77484](https://github.com/BjornMelin/ai-agent-builder/commit/cf77484f9bfe16261e733576bfe5e779281b2c05))

## [0.1.12](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.11...ai-agent-builder-v0.1.12) (2026-02-10)


### Bug Fixes

* **citations:** address review feedback ([fa9d568](https://github.com/BjornMelin/ai-agent-builder/commit/fa9d568ee55e80526037a5edd74fbcb0d122a42e))
* **db:** address PR review feedback ([a91f48d](https://github.com/BjornMelin/ai-agent-builder/commit/a91f48dbee02772808fe63b08575c70102d31368))
* **ui:** address review feedback ([bf9f919](https://github.com/BjornMelin/ai-agent-builder/commit/bf9f919ec2fcfde191defb3d2b35e53f173e43c4))
* **ui:** show delete errors in confirm dialog ([c88f3aa](https://github.com/BjornMelin/ai-agent-builder/commit/c88f3aa8cfb5c66ee898ae9bc78e734eba98f78d))
* **urls:** canonicalize http(s) url normalization ([6b05e85](https://github.com/BjornMelin/ai-agent-builder/commit/6b05e85df977188885b95997dc2fb7f14d22b74c))

## [0.1.11](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.10...ai-agent-builder-v0.1.11) (2026-02-10)


### Features

* add agent skills + UI for management ([36f0986](https://github.com/BjornMelin/ai-agent-builder/commit/36f0986595886ba5c350627691b985bf64084ba8))
* add project skills table and relations for agent skills management ([ebc6f3c](https://github.com/BjornMelin/ai-agent-builder/commit/ebc6f3c77e5263063f00cd00396746e456cb6c9e))
* **code-mode:** enhance sandbox path management and introduce redaction utilities ([d05783c](https://github.com/BjornMelin/ai-agent-builder/commit/d05783c502395bc9091303bca7abd38e1d80070d))
* implement runtime-loadable Agent Skills with project-scoped overrides and skills registry integration ([eb06c58](https://github.com/BjornMelin/ai-agent-builder/commit/eb06c587dd54c692b726d5f9672243d2022910f7))
* **projects:** implement virtualized project list and enhance project management ([9fbff7a](https://github.com/BjornMelin/ai-agent-builder/commit/9fbff7a6a9e7b45b54bb17a196994b92c51b6940))
* **skills:** add registry UI management and runtime loading ([1fc2161](https://github.com/BjornMelin/ai-agent-builder/commit/1fc2161851906478b2751b84a6adfd209bcb8171))
* **skills:** enhance skills management with installed and registry tabs ([bdd8b55](https://github.com/BjornMelin/ai-agent-builder/commit/bdd8b558adc8bba391004ac8dd9ce25dcd98f597))
* **workflows:** introduce workflow orchestration utilities and enhance error handling ([dd85e33](https://github.com/BjornMelin/ai-agent-builder/commit/dd85e3366ee6a3826b277cdf8a34694d27b4c3e2))


### Bug Fixes

* **security:** avoid insecure temp-file pattern in skill fs reads ([12731d7](https://github.com/BjornMelin/ai-agent-builder/commit/12731d7dea8508e3945aa3f5f3ff4d06f6cd15f9))
* **skills:** address follow-up review ([f6df49c](https://github.com/BjornMelin/ai-agent-builder/commit/f6df49cf9df24f2c15c1b17b6689116e30d9db26))
* **skills:** address review feedback ([4ac6c8c](https://github.com/BjornMelin/ai-agent-builder/commit/4ac6c8ca23eda39af5de250a45bf3f7403b21efe))
* **skills:** address review feedback ([26de75c](https://github.com/BjornMelin/ai-agent-builder/commit/26de75c4bc0d087bf6bd018bdfa0773a8c67e0c7))
* **skills:** align env defaults ([33d9dac](https://github.com/BjornMelin/ai-agent-builder/commit/33d9dac896769b840ba5cf5f603bafde2d4b94c8))
* **skills:** reject directory paths in readFile ([371c604](https://github.com/BjornMelin/ai-agent-builder/commit/371c60471766bff5c7968979c11e26eb2037c2ac))

## [0.1.10](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.9...ai-agent-builder-v0.1.10) (2026-02-09)


### Features

* add Approvals and Code Mode tabs with corresponding components ([65a1358](https://github.com/BjornMelin/ai-agent-builder/commit/65a1358e4acf008eaf76486ce87e3d87acb4dc33))
* **code-mode:** finalize compaction and docs ([91d7c3d](https://github.com/BjornMelin/ai-agent-builder/commit/91d7c3d20f76b29aa5fd4c7884ade9a06d57cc57))
* implementation runs code mode; sandbox; ctx-zip + bash tooling; repo + deploy agent automation ([5250f1e](https://github.com/BjornMelin/ai-agent-builder/commit/5250f1e2804ab27b9993d0114a0396c23e578c15))
* **repo:** implement GitHub repo runtime detection and enhance sandbox policies ([9f8311c](https://github.com/BjornMelin/ai-agent-builder/commit/9f8311cbf8746bc24d052cea5b9670a481eb9a52))


### Bug Fixes

* **sandbox:** harden code mode defaults and runtime detection ([a1adea5](https://github.com/BjornMelin/ai-agent-builder/commit/a1adea5e3893b249f0d8997bdf154cc834d21f50))
* **schema:** remove NOT NULL constraint from approvedBy column in approvals table ([a211289](https://github.com/BjornMelin/ai-agent-builder/commit/a211289c4687a20288bc05ec4a43572b5448a2eb))

## [0.1.9](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.8...ai-agent-builder-v0.1.9) (2026-02-08)


### Features

* agent registry research mcp + tools ([d5c47bd](https://github.com/BjornMelin/ai-agent-builder/commit/d5c47bd0d68daabe116f79710ea247ed6ff05465))
* **chat:** agent modes, web research, context7, persistence ([7f320fe](https://github.com/BjornMelin/ai-agent-builder/commit/7f320fe7047a4d003d667329ce3145b774e282f9))
* **chat:** finalize web research tool contracts ([e852816](https://github.com/BjornMelin/ai-agent-builder/commit/e852816d0840fcfc56891d2c49a2de0f6a75679b))
* **chat:** harden web research + Context7 tools ([302e1e8](https://github.com/BjornMelin/ai-agent-builder/commit/302e1e834117b0813074a42548970fc9e73ed943))
* **tests:** enhance test coverage and add new test cases for AI components ([39ae1a3](https://github.com/BjornMelin/ai-agent-builder/commit/39ae1a3e913d5b4fc3f68e593971cbde846c4305))
* **tests:** introduce utility for tool execution options and refactor tests ([4695492](https://github.com/BjornMelin/ai-agent-builder/commit/469549275a164c89febb328c41715b4b978f28af))


### Bug Fixes

* address PR review feedback ([8538abe](https://github.com/BjornMelin/ai-agent-builder/commit/8538abeed9033f91e8f202823a61c678affa946b))
* **chat:** close Context7 MCP client ([04d2b9b](https://github.com/BjornMelin/ai-agent-builder/commit/04d2b9bdc1a87e3fbead0a2c1afa9cfbca9c4e5c))
* **review:** add shared abort listener ([53fd281](https://github.com/BjornMelin/ai-agent-builder/commit/53fd281c26164c0403bdd489aaa7b096cad8bf18))
* **review:** address PR 26 threads ([bac31e1](https://github.com/BjornMelin/ai-agent-builder/commit/bac31e1d5b048aec690d1848d396619b9f589593))
* **review:** resolve PR 26 feedback ([e1e430d](https://github.com/BjornMelin/ai-agent-builder/commit/e1e430d444568bc0fa04fd7ea1a9e3f1615e8edb))
* **web-extract:** harden timeout detection ([11ba2f4](https://github.com/BjornMelin/ai-agent-builder/commit/11ba2f4fe30f34b51484a01f6a19bdc14952e957))

## [0.1.8](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.7...ai-agent-builder-v0.1.8) (2026-02-07)


### Features

* **app:** finalize cache-components search hardening ([cabcafe](https://github.com/BjornMelin/ai-agent-builder/commit/cabcafe3f14054a0d026b9cbafcb91bc319c85a9))
* **app:** finalize cache-components search UX and bot preview resource governance ([2530c36](https://github.com/BjornMelin/ai-agent-builder/commit/2530c36b75ebeaa28360c2df799004b8da21e216))
* **auth:** add session parameters for production build to getSessionCached ([b549841](https://github.com/BjornMelin/ai-agent-builder/commit/b549841686ebf3bf3f7446acb2b48f0b52f7d407))
* **ui:** overhaul app shell and account settings navigation ([ce26c14](https://github.com/BjornMelin/ai-agent-builder/commit/ce26c14a95c519625a13d8b0c8a0c99b4a57b54f))


### Bug Fixes

* **a11y:** label prompt action trigger by default ([4cb4024](https://github.com/BjornMelin/ai-agent-builder/commit/4cb40248a6236e474db3e0ba9eee606f7351df9b))
* **auth:** unblock cache-components builds and add local user create ([e03b381](https://github.com/BjornMelin/ai-agent-builder/commit/e03b381d06a08d3fcf1d82d11b922bd242121acb))
* **pr:** address review feedback ([47dfdee](https://github.com/BjornMelin/ai-agent-builder/commit/47dfdee98ef1e8623febbe7fd152a9297c9b223a))
* **review:** address PR 23 feedback ([845fd1e](https://github.com/BjornMelin/ai-agent-builder/commit/845fd1e0bece08af7ed9275761a3d4f28f2b583f))
* **security:** address neon-auth-local code scanning ([55bac59](https://github.com/BjornMelin/ai-agent-builder/commit/55bac595d344242632cd9d3ab2bfbb234795e2fd))

## [0.1.7](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.6...ai-agent-builder-v0.1.7) (2026-02-06)


### Features

* add GitHub Actions workflows for Vercel preview environment management ([60fe032](https://github.com/BjornMelin/ai-agent-builder/commit/60fe032bc22e142a84c8cc98eab9371cf85bc6c1))
* enhance chat functionality with initial thread support and status management ([9a9dac6](https://github.com/BjornMelin/ai-agent-builder/commit/9a9dac6150b80a2e90a1ed1e82a09f8324ef3d04))
* implement dynamic loading for AI elements and enhance audio player functionality ([9630036](https://github.com/BjornMelin/ai-agent-builder/commit/96300368c69ab2f37ab53df6f5ec296883620f13))
* react + accessibility optimizations, bundle size reductions, GHA for Vercel preview branches ([63787f4](https://github.com/BjornMelin/ai-agent-builder/commit/63787f466ccd88f2a87daaa885922b9e4a4e5832))


### Bug Fixes

* **a11y:** keep labeled disabled audio fallback controls ([d1fc2c7](https://github.com/BjornMelin/ai-agent-builder/commit/d1fc2c7b3a71bed7f79376e1e75efc697918d6ef))
* **ai-elements:** harden accessibility semantics and test flow ([306fc02](https://github.com/BjornMelin/ai-agent-builder/commit/306fc02654990add3fdb27ffe40bf69c6c333678))
* **chat:** apply review follow-up fixes ([11dbe46](https://github.com/BjornMelin/ai-agent-builder/commit/11dbe4627d2a81922a8955caa08790c681d25e70))
* **chat:** enhance session termination and message handling in chat client ([d156530](https://github.com/BjornMelin/ai-agent-builder/commit/d156530a6e13fb5c5fbd2129fe2ceaf1bff5919f))
* **chat:** harden thread lifecycle persistence and preserve terminal ui status ([9f26fa2](https://github.com/BjornMelin/ai-agent-builder/commit/9f26fa2862f820bbd55817e34fc7f041c6a400c7))
* **chat:** improve chat client session handling and message management ([d1760da](https://github.com/BjornMelin/ai-agent-builder/commit/d1760daf82fe3ba689bd0f0c75e5b9e6e070d124))
* **chat:** update chat client props and streamline message submission ([9642c0e](https://github.com/BjornMelin/ai-agent-builder/commit/9642c0e1f094d77dd86eed2524deaaa52fa5a97c))
* **pr-19:** address unresolved CodeRabbit review threads ([862c694](https://github.com/BjornMelin/ai-agent-builder/commit/862c6941e3b774e9e09e965895a70e07ab49f8c1))
* **pr-19:** resolve unresolved CodeRabbit review threads ([2c86aaf](https://github.com/BjornMelin/ai-agent-builder/commit/2c86aafabb8e8286de6206e53f167ccccbbaf958))
* **review:** address unresolved PR [#19](https://github.com/BjornMelin/ai-agent-builder/issues/19) feedback threads ([ed8831c](https://github.com/BjornMelin/ai-agent-builder/commit/ed8831c019ffdb15646858efe035d68f77ebe29c))

## [0.1.6](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.5...ai-agent-builder-v0.1.6) (2026-02-05)


### Features

* **app:** improve accessibility, motion performance, and metadata ([00575c8](https://github.com/BjornMelin/ai-agent-builder/commit/00575c8bbce625c208706f857a750fd131ba8d99))
* **artifacts:** add versioned artifacts and citations DAL ([d734a58](https://github.com/BjornMelin/ai-agent-builder/commit/d734a58b309b0a8a7c991ec2fdcbfb24edaee26b))
* **artifacts:** enhance artifact export functionality with improved download link and relative date formatting ([86a8e95](https://github.com/BjornMelin/ai-agent-builder/commit/86a8e95702f39bf56b31febb8b91a01854115fd7))
* **artifacts:** implement artifact versioning and retrieval enhancements with comprehensive tests ([05fdc5a](https://github.com/BjornMelin/ai-agent-builder/commit/05fdc5af709ddbe5692d8cb00410c9e2657bda1d))
* **dependencies:** add @tanstack/react-virtual and @tanstack/virtual-core to package.json and bun.lock; update SPEC index metadata and improve artifact listing component ([9d9da78](https://github.com/BjornMelin/ai-agent-builder/commit/9d9da784f773bf23bc3dee6c33be051bfbb204d8))
* **export:** add deterministic artifact zip export ([da0c333](https://github.com/BjornMelin/ai-agent-builder/commit/da0c3332e0b59542b287abea5b285e5855d175a0))
* **export:** enhance deterministic ZIP export with path sanitization and conflict handling ([5dcab7f](https://github.com/BjornMelin/ai-agent-builder/commit/5dcab7ffcbeec5856815d2d3d34870e838750d99))
* **export:** implement deterministic artifact export ZIP with enhanced sanitization and manifest integrity ([a02d2cf](https://github.com/BjornMelin/ai-agent-builder/commit/a02d2cff40f99c604de073bf59e3d7969d2d09db))
* **metadata:** add SITE_TAGLINE for enhanced branding in Open Graph and Twitter images ([cf00993](https://github.com/BjornMelin/ai-agent-builder/commit/cf009934eae3fc2a7a748255aa7d18b6e0ec746b))
* **runs:** migrate durable runs to Workflow DevKit ([f6b1b09](https://github.com/BjornMelin/ai-agent-builder/commit/f6b1b096c0d6045097e4acc2675a2c4d587376ac))
* **search:** index artifacts and include in project search ([7a7c3ca](https://github.com/BjornMelin/ai-agent-builder/commit/7a7c3ca347206475265357716f9499d48699b883))
* **ui:** add project artifacts tab ([ff2f62f](https://github.com/BjornMelin/ai-agent-builder/commit/ff2f62f67bfb6fed38e8a9bb7c95f05a4d62de02))
* unify durable runs workflow devkit ([39ad336](https://github.com/BjornMelin/ai-agent-builder/commit/39ad336c8982a66b6e4a57a369937137785859d9))
* **workflows:** add tests for projectRun workflow and enhance error handling ([3ec3103](https://github.com/BjornMelin/ai-agent-builder/commit/3ec3103e522d54c19a55f09d67ed93bfea36273e))
* **workflows:** persist run summary artifact ([4a2b50c](https://github.com/BjornMelin/ai-agent-builder/commit/4a2b50cb2b959adbc7c1d6a79a384cda35aa0d1d))


### Bug Fixes

* **retrieval:** dedupe latest artifact hits by logical key ([05828fa](https://github.com/BjornMelin/ai-agent-builder/commit/05828faa983139ff4ad46a078a00cf442ad32eba))
* **runs:** harden stream resilience and workflow cancellation ([9fa1bad](https://github.com/BjornMelin/ai-agent-builder/commit/9fa1bad132dc6309ed3e267da41a5db3b71e2326))

## [0.1.5](https://github.com/BjornMelin/ai-agent-builder/compare/ai-agent-builder-v0.1.4...ai-agent-builder-v0.1.5) (2026-02-04)


### Features

* add components configuration and update ESLint rules for registry components ([5cff0bd](https://github.com/BjornMelin/ai-agent-builder/commit/5cff0bde5b1cbdf027532b721776a85c196516f7))
* **app:** add workspace routes and layout ([b0b3283](https://github.com/BjornMelin/ai-agent-builder/commit/b0b32834accfb5d4d21ccab9097f8034dc39d2ab))
* **chat:** implement chat API endpoints and tests ([658d4d0](https://github.com/BjornMelin/ai-agent-builder/commit/658d4d0a7b31a75b35233a0450a2a13d94fb6248))
* enhance UI/UX with accessibility improvements, input resets, and animation controls across various components. ([3a09ab1](https://github.com/BjornMelin/ai-agent-builder/commit/3a09ab178f710e619bf395516d5ebc5c3b46c191))
* Improve accessibility for AI elements components by adding `aria-label` attributes and refactoring interactive elements, and establish test suite documentation. ([4744149](https://github.com/BjornMelin/ai-agent-builder/commit/4744149f07fd81888eb911785218cc63aec27b3e))
* integrate Vercel Workflow into Next.js configuration ([196ec10](https://github.com/BjornMelin/ai-agent-builder/commit/196ec10e7594ce211a97abc77813dc51b550119f))
* introduce `parseJsonBody` utility to standardize JSON body parsing and Zod validation across API routes, accompanied by new tests. ([309b2e0](https://github.com/BjornMelin/ai-agent-builder/commit/309b2e0e96092562a6f880f8287ec8b1c9f33a00))
* **projects:** enhance project creation and error handling ([b575ac5](https://github.com/BjornMelin/ai-agent-builder/commit/b575ac5e37b11018c2d9c44fd38f010138b323ac))
* **ui:** vendor ai-elements and shadcn primitives ([b934a03](https://github.com/BjornMelin/ai-agent-builder/commit/b934a03542f3c42e20ae869d60797572040bf97d))
* **workflow:** integrate Vercel Workflow + AI Elements ([6458674](https://github.com/BjornMelin/ai-agent-builder/commit/645867405086a7d36b5b55f26a51c5ef5a9a3a76))
* **workflows:** add chat workflow endpoints ([e41d64e](https://github.com/BjornMelin/ai-agent-builder/commit/e41d64e54cdd651ddf4ff724bdb75c59d472f9ca))


### Bug Fixes

* **ai-elements:** address PR [#13](https://github.com/BjornMelin/ai-agent-builder/issues/13) review feedback ([f688e29](https://github.com/BjornMelin/ai-agent-builder/commit/f688e294514a6e7c6b18c39eecb9fd44f7e9950c))
* **ai-elements:** complete accessibility hardening and regression coverage ([41dbe3f](https://github.com/BjornMelin/ai-agent-builder/commit/41dbe3fa747863b2e3f7cd1bdbeef2dabc325890))
* **ai-elements:** harden prompt input and mic selector behavior ([2744ec7](https://github.com/BjornMelin/ai-agent-builder/commit/2744ec7fbf20bc316a3b00da5617f6aee1f5ad62))
* **ai-elements:** harden schema and citation components ([2a310a3](https://github.com/BjornMelin/ai-agent-builder/commit/2a310a355eea3fb427e3d3d4eec57b456806f122))
* **ai-elements:** improve a11y and docs for results and package UI ([d024cde](https://github.com/BjornMelin/ai-agent-builder/commit/d024cde184d972191fc81c25c592ddacd4565058))
* **ai-elements:** improve commit and transcription accessibility ([9c7f990](https://github.com/BjornMelin/ai-agent-builder/commit/9c7f9908452275d5bbcfb1458728c2c6ae0b0034))
* **ai-elements:** improve docs and error handling in metadata UIs ([cd8733e](https://github.com/BjornMelin/ai-agent-builder/commit/cd8733eb975b0f4f3dcd70d5533234d496cdfb8f))
* **ai-elements:** improve message, prompt, and mic reliability ([d31ed07](https://github.com/BjornMelin/ai-agent-builder/commit/d31ed077c743d690ba35d4e4bb2813b77051a046))
* **ai-elements:** improve motion a11y and source semantics ([36b423c](https://github.com/BjornMelin/ai-agent-builder/commit/36b423cf4f132aa351311f443e7984f21d4826ef))
* **ai-elements:** tighten accessibility and event handling ([acfcf21](https://github.com/BjornMelin/ai-agent-builder/commit/acfcf219053fd7c76e039dd0ff4bb1aa575cff21))
* **api,ai-elements:** harden auth flow and accessibility ([2dee733](https://github.com/BjornMelin/ai-agent-builder/commit/2dee73383da5cb776b2b2a6f2709194988adfe28))
* **api:** parallelize auth and params in chat stream route ([4122b03](https://github.com/BjornMelin/ai-agent-builder/commit/4122b0384ae24b430da29c5a648bb4d453c231f7))
* **chat:** harden stream auth checks and update resumable contract docs ([41efe36](https://github.com/BjornMelin/ai-agent-builder/commit/41efe364204619c410e79d906f7beb8549ea7651))
* **chat:** tighten stream contract tests and state update semantics ([0338bab](https://github.com/BjornMelin/ai-agent-builder/commit/0338bab378cc9d8b0b0976303fcaf3c986e453cb))
* improve accessibility of forms, inputs, buttons, and status messages with ARIA attributes and semantic HTML. ([f073667](https://github.com/BjornMelin/ai-agent-builder/commit/f073667b54d454b3a898b1babdfda45c0e3b479b))
* **pr-13:** address review thread issues in chat, ui, and workflow ([56a64c7](https://github.com/BjornMelin/ai-agent-builder/commit/56a64c70d18d09d995fcac6cfce100f1a44492ba))
* **pr-13:** harden search, file-tree, and docs comments ([1f66847](https://github.com/BjornMelin/ai-agent-builder/commit/1f66847f7dfd9c18448df16880a8d9c9ab1ae835))
* **pr-13:** tighten app UX copy, docs, and error handling ([3eae0fe](https://github.com/BjornMelin/ai-agent-builder/commit/3eae0fe26363b83ed4dea8007f216f8355a1afcf))
* **pr-13:** tighten chat and speech ai-elements behavior ([dcd8923](https://github.com/BjornMelin/ai-agent-builder/commit/dcd89238da40ce083c2c08a2be268a7a9faaa122))
* **pr13:** address unresolved review feedback ([57e2511](https://github.com/BjornMelin/ai-agent-builder/commit/57e251134b63120f68d2bcdfd4651955faad56ab))
* **pr:** address review comments and polish components ([ace503f](https://github.com/BjornMelin/ai-agent-builder/commit/ace503f7b8a7897aa895aa12ca7f91da0235d66c))
* **review:** resolve latest PR [#13](https://github.com/BjornMelin/ai-agent-builder/issues/13) comments ([84b3996](https://github.com/BjornMelin/ai-agent-builder/commit/84b399660adce970b4da82490e8c8340f9eede1d))
* **ui:** address accessibility and import review notes ([d102269](https://github.com/BjornMelin/ai-agent-builder/commit/d1022691b7f01e54f0f094e9a2c43e315391c398))
* **ui:** resolve motion, semantics, and docs review threads ([b0c68e0](https://github.com/BjornMelin/ai-agent-builder/commit/b0c68e0e816ad7f4a7f3de144e7507c960a8a883))
* **ui:** tighten selector, config docs, and button group imports ([18df9e3](https://github.com/BjornMelin/ai-agent-builder/commit/18df9e3fdfc0e5255d49d0f239369a58a2bb4985))

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
