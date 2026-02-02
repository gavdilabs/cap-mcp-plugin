# Changelog

## [1.4.1](///compare/1.4.0...1.4.1) (2026-02-02)

### Bug Fixes

* Remove string coercion from update and create tools ([#108](undefined/undefined/undefined/issues/108)) 724ba0c

## [1.4.0](///compare/1.3.2...1.4.0) (2026-01-26)

### Features

* **annotations:** add support for $expand OData query parameter ([#100](undefined/undefined/undefined/issues/100)) 4362e0a, closes #98

### Bug Fixes

* ISO Date Validation in Zod ([#106](undefined/undefined/undefined/issues/106)) c0b007d

## [1.3.2](///compare/1.3.1...1.3.2) (2025-12-03)

## [1.3.1](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.3.0...1.3.1) (2025-11-06)

### Bug Fixes

* Remove left-over console.log statements ([#90](https://github.com/gavdilabs/cap-mcp-plugin/issues/90)) ([5d05469](https://github.com/gavdilabs/cap-mcp-plugin/commit/5d05469847b216f85aeefa1d72a2c14c9649cf54))

## [1.3.0](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.2.2...1.3.0) (2025-11-03)

### Features

* mcp hint elements ([#85](https://github.com/gavdilabs/cap-mcp-plugin/issues/85)) ([84ca765](https://github.com/gavdilabs/cap-mcp-plugin/commit/84ca765eed9c8b29c6c07f04db02c77251259f01))
* Omit properties through annotation ([#81](https://github.com/gavdilabs/cap-mcp-plugin/issues/81)) ([6eef105](https://github.com/gavdilabs/cap-mcp-plugin/commit/6eef10526c8729538172a856834b70556f1ead22)), closes [#82](https://github.com/gavdilabs/cap-mcp-plugin/issues/82)

### Bug Fixes

* Computed elements removed from deep inserts ([#87](https://github.com/gavdilabs/cap-mcp-plugin/issues/87)) ([376de2a](https://github.com/gavdilabs/cap-mcp-plugin/commit/376de2a576656b995609d7f610482cef6664f224))

### Additional Changes

* Remove spelling mistake from package.json ([c348dd2](https://github.com/gavdilabs/cap-mcp-plugin/commit/c348dd2cae8e89ebfc8678066e353ea8c86264e3))

## [1.2.2](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.2.1...1.2.2) (2025-10-29)

### Bug Fixes

* Multi service conflicts for identical endpoints ([#84](https://github.com/gavdilabs/cap-mcp-plugin/issues/84)) ([127ffb7](https://github.com/gavdilabs/cap-mcp-plugin/commit/127ffb74fe1146188ac132885a2bf9f07299376b))

## [1.2.1](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.2.0...1.2.1) (2025-10-29)

### Bug Fixes

* Core.Computed elements ignored in Update and Create tooling ([#79](https://github.com/gavdilabs/cap-mcp-plugin/issues/79)) ([3723f23](https://github.com/gavdilabs/cap-mcp-plugin/commit/3723f23c6f4e41f03a70b075296494dbbc89ac94))
* Correct scoped WRITE restrictions based on CAP specs ([#77](https://github.com/gavdilabs/cap-mcp-plugin/issues/77)) ([19f287b](https://github.com/gavdilabs/cap-mcp-plugin/commit/19f287b8b79d5e5b80c33c8ed42dd47b045518b7))
* Local mock auth without xsuaa service instance creation ([#80](https://github.com/gavdilabs/cap-mcp-plugin/issues/80)) ([5125315](https://github.com/gavdilabs/cap-mcp-plugin/commit/5125315be908ea77d2e744520153429687b2787b))
* skip core computed regardless of case ([#82](https://github.com/gavdilabs/cap-mcp-plugin/issues/82)) ([d01013f](https://github.com/gavdilabs/cap-mcp-plugin/commit/d01013f4053c3a33963010d22e108c503b277ca9))

### Additional Changes

* Remove old test file ([fbc2b43](https://github.com/gavdilabs/cap-mcp-plugin/commit/fbc2b43f586fc55b9ab8223ab61590fa8217270d))

## [1.2.0](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.1.5...1.2.0) (2025-10-27)

### Features

* Support for PKCE and IAS ([#70](https://github.com/gavdilabs/cap-mcp-plugin/issues/70)) ([663ed91](https://github.com/gavdilabs/cap-mcp-plugin/commit/663ed91e0196fb008e7ee5866ada5866295448d7))

### Bug Fixes

* Grant string, grant role and WRITE supported for access ([#75](https://github.com/gavdilabs/cap-mcp-plugin/issues/75)) ([769c6fc](https://github.com/gavdilabs/cap-mcp-plugin/commit/769c6fc7625c53f661f9259a029b456e2fe3cc18))

## [1.1.5](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.1.4...1.1.5) (2025-10-23)

### Bug Fixes

* Fixed CDS version for relaxed major ([#72](https://github.com/gavdilabs/cap-mcp-plugin/issues/72)) ([d711cba](https://github.com/gavdilabs/cap-mcp-plugin/commit/d711cba025ae2eb02f7691654cae23194a2e0025))

## [1.1.4](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.1.3...1.1.4) (2025-10-22)

### Bug Fixes

* namespaces handled in parsing step for custom service namespaces ([#68](https://github.com/gavdilabs/cap-mcp-plugin/issues/68)) ([48abe62](https://github.com/gavdilabs/cap-mcp-plugin/commit/48abe62e0cdf2915badafe8d859d756a8410b32d)), closes [#69](https://github.com/gavdilabs/cap-mcp-plugin/issues/69)

### Additional Changes

* upgrade cds version from 9.3.1 to 9.4.3 ([#69](https://github.com/gavdilabs/cap-mcp-plugin/issues/69)) ([a9ea022](https://github.com/gavdilabs/cap-mcp-plugin/commit/a9ea022a0459ea61b2aeeefdf1fa8ba56b1135a5))

## [1.1.3](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.1.2...1.1.3) (2025-10-08)

### Bug Fixes

* inefficient regular expression vulnerability ([#63](https://github.com/gavdilabs/cap-mcp-plugin/issues/63)) ([8590c38](https://github.com/gavdilabs/cap-mcp-plugin/commit/8590c386a3f47130b74899390b4267c53ee3360a))
* permissions for GITHUB_TOKEN in actions ([#64](https://github.com/gavdilabs/cap-mcp-plugin/issues/64)) ([0057753](https://github.com/gavdilabs/cap-mcp-plugin/commit/00577531479661824846599123245019e4f522cf))

### Additional Changes

* Add download bagde to README ([613b46d](https://github.com/gavdilabs/cap-mcp-plugin/commit/613b46de0baade5ef09c4eeddc383a927d63343e))
* code coverage reports ([#62](https://github.com/gavdilabs/cap-mcp-plugin/issues/62)) ([b8cc916](https://github.com/gavdilabs/cap-mcp-plugin/commit/b8cc916354dbabfda74af2b4de3d5911cf19a983))
* upgraded sdk for mcp ([#61](https://github.com/gavdilabs/cap-mcp-plugin/issues/61)) ([b4116d8](https://github.com/gavdilabs/cap-mcp-plugin/commit/b4116d84f7409f36348704892f9b0673a9fde9ae))

## [1.1.2](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.1.1...1.1.2) (2025-10-01)

### Bug Fixes

* Multi-key associations and related types ([#56](https://github.com/gavdilabs/cap-mcp-plugin/issues/56)) ([eb57b24](https://github.com/gavdilabs/cap-mcp-plugin/commit/eb57b24c963605ec4e290a855bf4ef1524226524))

## [1.1.1](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.1.0...1.1.1) (2025-09-29)

### Features

* add author attribution to changelog entries ([#52](https://github.com/gavdilabs/cap-mcp-plugin/issues/52)) ([e05eb12](https://github.com/gavdilabs/cap-mcp-plugin/commit/e05eb12a69c0c92f53995c6a950f3f9150b83785))

### Bug Fixes

* array elements on resources ([#50](https://github.com/gavdilabs/cap-mcp-plugin/issues/50)) ([b18f9f6](https://github.com/gavdilabs/cap-mcp-plugin/commit/b18f9f62aa7d753f5546edec8d288f1fb1401fee))
* composition zod type ([#53](https://github.com/gavdilabs/cap-mcp-plugin/issues/53)) ([0a85d7a](https://github.com/gavdilabs/cap-mcp-plugin/commit/0a85d7a10976462741eee0bd7bbc15e7118caae3))
* filters, limits and orders applied to count and aggregates ([#55](https://github.com/gavdilabs/cap-mcp-plugin/issues/55)) ([e862e54](https://github.com/gavdilabs/cap-mcp-plugin/commit/e862e5410887e80b92ae83a1e09e09c70874ac33))

### Additional Changes

* Add commit check badge ([#54](https://github.com/gavdilabs/cap-mcp-plugin/issues/54)) ([7dda2a3](https://github.com/gavdilabs/cap-mcp-plugin/commit/7dda2a3e5bc1d8dafbee512319f4c129a058e73f))
* eslint config ignores ([36de805](https://github.com/gavdilabs/cap-mcp-plugin/commit/36de80597257049552089212414e67fdbc30d931))
* Move author info changelog to github.releaseNotes ([b886ec9](https://github.com/gavdilabs/cap-mcp-plugin/commit/b886ec9e7554e8c0cefcfcbfb3af7f460cefad71))
* README badges ([a10b61c](https://github.com/gavdilabs/cap-mcp-plugin/commit/a10b61c8a34142ff826accebb0311737e669ec17))

## [1.1.0](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.0.2...1.1.0) (2025-09-25)

### Features

* enhanced wrap hints ([#43](https://github.com/gavdilabs/cap-mcp-plugin/issues/43)) ([18dceef](https://github.com/gavdilabs/cap-mcp-plugin/commit/18dceef10b0565a4fe2f9f92c10111cc9c649c89))
* extended instructions through markdown files ([#45](https://github.com/gavdilabs/cap-mcp-plugin/issues/45)) ([0fc02e3](https://github.com/gavdilabs/cap-mcp-plugin/commit/0fc02e3d0cd8a3d17d04788be19fcbbce231aa0b))

### Bug Fixes

* Array types for tools ([#46](https://github.com/gavdilabs/cap-mcp-plugin/issues/46)) ([cb84f98](https://github.com/gavdilabs/cap-mcp-plugin/commit/cb84f98c934603320511fd2afdfaa5775a623a6d))

## [1.0.2](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.0.1...1.0.2) (2025-09-23)

### Bug Fixes

* Reference model for complex types ([#40](https://github.com/gavdilabs/cap-mcp-plugin/issues/40)) ([a92560c](https://github.com/gavdilabs/cap-mcp-plugin/commit/a92560c6a6a2920e72f60785142b9715716b1c27))
* Wrap annotations parsing ([#41](https://github.com/gavdilabs/cap-mcp-plugin/issues/41)) ([0528504](https://github.com/gavdilabs/cap-mcp-plugin/commit/0528504ec41814168121f7831fe82c0bd4783b21))

## [1.0.1](https://github.com/gavdilabs/cap-mcp-plugin/compare/1.0.0...1.0.1) (2025-09-22)

### Bug Fixes

* undefined definition elements ([#38](https://github.com/gavdilabs/cap-mcp-plugin/issues/38)) ([6c3d7bd](https://github.com/gavdilabs/cap-mcp-plugin/commit/6c3d7bd2cc80435787ada529e0257fd8332b9532))

## [1.0.0](https://github.com/gavdilabs/cap-mcp-plugin/compare/0.10.1...1.0.0) (2025-09-21)

### Features

* OAuth integration ([#37](https://github.com/gavdilabs/cap-mcp-plugin/issues/37)) ([eff0de0](https://github.com/gavdilabs/cap-mcp-plugin/commit/eff0de095ab0b35c3feb32505d830509cb39cc9e))

### Additional Changes

* Update README.md ([b62e8ba](https://github.com/gavdilabs/cap-mcp-plugin/commit/b62e8ba1655e282b32ffbe634f23f68d21e9e11d))

## [0.10.1](https://github.com/gavdilabs/cap-mcp-plugin/compare/0.10.0...0.10.1) (2025-09-11)

### Bug Fixes

* Stop parsing if no definitions or elements ([#33](https://github.com/gavdilabs/cap-mcp-plugin/issues/33)) ([17e632a](https://github.com/gavdilabs/cap-mcp-plugin/commit/17e632a7826cb62b57f259d9aeddd4cb0522dec9))

## [0.10.0](https://github.com/gavdilabs/cap-mcp-plugin/compare/0.9.9...0.10.0) (2025-09-10)

### Features

* MCP Elicitations ([#31](https://github.com/gavdilabs/cap-mcp-plugin/issues/31)) ([a3b4e05](https://github.com/gavdilabs/cap-mcp-plugin/commit/a3b4e0575586eefc02a3312de231d4cc847a3b2b))

### Additional Changes

* Remove unused methods and types ([#32](https://github.com/gavdilabs/cap-mcp-plugin/issues/32)) ([245191a](https://github.com/gavdilabs/cap-mcp-plugin/commit/245191ad7c4dc7c46e8ba3fdad72a2d8e6a21e54))

## [0.9.9](https://github.com/gavdilabs/cap-mcp-plugin/compare/0.9.8...0.9.9) (2025-08-27)

### Bug Fixes

* improve query description ([#29](https://github.com/gavdilabs/cap-mcp-plugin/issues/29)) ([44079f0](https://github.com/gavdilabs/cap-mcp-plugin/commit/44079f041fa103741966821200519dc57258930b))

### Additional Changes

* Create CODE_OF_CONDUCT.md ([#26](https://github.com/gavdilabs/cap-mcp-plugin/issues/26)) ([d582879](https://github.com/gavdilabs/cap-mcp-plugin/commit/d5828792b0462d8f34b5ca50c0c70cecd435aff8))
* Create SECURITY.md ([#27](https://github.com/gavdilabs/cap-mcp-plugin/issues/27)) ([bad5842](https://github.com/gavdilabs/cap-mcp-plugin/commit/bad58427fb45521e4b7759e20c97e4f41e62ce7a))
* README.md update + CONTRIBUTING.md  ([#25](https://github.com/gavdilabs/cap-mcp-plugin/issues/25)) ([c447cde](https://github.com/gavdilabs/cap-mcp-plugin/commit/c447cde9aa73ead2b4fdf38da49c9bbb4f79efb7))
* Updated dependency versions for MCP and dev tools ([#24](https://github.com/gavdilabs/cap-mcp-plugin/issues/24)) ([d4567d5](https://github.com/gavdilabs/cap-mcp-plugin/commit/d4567d5bb15ef312760ce3acfacca4aef05d915c))

## [0.9.8](https://github.com/gavdilabs/cap-mcp-plugin/compare/0.9.7...0.9.8) (2025-08-21)

### Features

* add delete to entity tools ([#18](https://github.com/gavdilabs/cap-mcp-plugin/issues/18)) ([05f4f1b](https://github.com/gavdilabs/cap-mcp-plugin/commit/05f4f1b64b66f923eb7020924d056efe17ebaeb6))
* add server instructions to MCP server configuration ([#21](https://github.com/gavdilabs/cap-mcp-plugin/issues/21)) ([26bb9db](https://github.com/gavdilabs/cap-mcp-plugin/commit/26bb9db553f28cbe75fabc8d6baa7defbe6501f8))

### Bug Fixes

* body parser issue ([#20](https://github.com/gavdilabs/cap-mcp-plugin/issues/20)) ([fc7f03a](https://github.com/gavdilabs/cap-mcp-plugin/commit/fc7f03a5a9c7ccab0d553228ed432d10410912fc)), closes [#19](https://github.com/gavdilabs/cap-mcp-plugin/issues/19)

### Additional Changes

* Improved release pipeline ([#17](https://github.com/gavdilabs/cap-mcp-plugin/issues/17)) ([ad95c08](https://github.com/gavdilabs/cap-mcp-plugin/commit/ad95c08041aa8770fbbec0791a453e1436cb810c))

## 0.9.7 (2025-08-14)
