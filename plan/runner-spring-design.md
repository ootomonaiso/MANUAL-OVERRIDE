# Runner 繧ｸ繝｣繝ｳ繝ｫ縲後ヰ繝搾ｼ・pring・峨ワ繧ｶ繝ｼ繝峨崎ｨｭ險医・隕∽ｻｶ螳夂ｾｩ

- 譌･莉・ 2026-09-09
- 蟇ｾ雎｡繝悶Λ繝ｳ繝・ `feature/runner-genre`
- 繧ｹ繝・・繧ｿ繧ｹ: 螳溯｣・欠遉ｺ貂医∩

## 1. 閭梧勹繝ｻ逶ｮ逧・

Runner・医お繝ｳ繝峨Ξ繧ｹ繝ｩ繝ｳ繝翫・・峨ず繝｣繝ｳ繝ｫ縺ｯ譌｢縺ｫ莉･荳九ｒ謖√▲縺ｦ縺・ｋ:

- `RunnerPlugin`・・src/genres/BasePlugin.ts`・俄・隕冶ｦ壹ユ繝ｼ繝橸ｼ・ark 繝・・繝槭《afe 濶ｲ縺ｯ繝・ぅ繝ｼ繝ｫ `#00cec9`/`#55efc4`・・
- `src/data/genres/runner.json` 窶・繧ｸ繝｣繝ｳ繝ｫ螳夂ｾｩ・・auto_run` / `double_jump` / `long_air` / `near_miss_combo`・・
- 遘ｻ蜍慕ｳｻ繧ｳ繧｢讖溯・ 窶・閾ｪ蜍戊ｵｰ陦後∽ｺ梧ｮｵ繧ｸ繝｣繝ｳ繝励√さ繝ｨ繝ｼ繝・ち繧､繝縲√ず繝｣繝ｳ繝励ヰ繝・ヵ繧｡・・MovementFeature` + `sideScroller.ts`・・

莉雁屓縺ｮ逶ｮ逧・ **繝舌ロ・・pring・・* 縺ｨ縺・≧譁ｰ縺励＞螳牙・繝上じ繝ｼ繝峨ｒ霑ｽ蜉縺吶ｋ縲・
繝励Ξ繧､繝､繝ｼ縺御ｸ翫°繧牙ｽ薙◆繧九→騾壼ｸｸ縺ｮ繧ｸ繝｣繝ｳ繝励ｈ繧雁､ｧ縺阪￥蠑ｾ縺堺ｸ翫￡繧峨ｌ繧九・
縺薙ｌ縺ｫ繧医ｊ縲後ず繝｣繝ｳ繝励・莉｣繧上ｊ縺ｫ繝舌ロ繧定ｸ上ｓ縺ｧ鬮伜ｺｦ繧貞ｾ励ｋ縲阪→縺・≧繝ｩ繝ｳ繝翫・繧峨＠縺・焔隗ｦ繧翫ｒ蜉縺医ｋ縲・

## 2. 隕∽ｻｶ

### 2.1 繝舌ロ繝上じ繝ｼ繝・

- 蠖｢迥ｶID: `'spring'`・・HazardShape` 縺ｫ霑ｽ蜉・・
- 蟶ｸ縺ｫ螳牙・・・isSafe = true`・峨・*邨ｶ蟇ｾ縺ｫ繝繝｡繝ｼ繧ｸ繧剃ｸ弱∴縺ｪ縺・*・郁｢ｫ蠑ｾ邨瑚ｷｯ `_onPlayerHit` 繧帝壹＆縺ｪ縺・ｼ・
- 譚｡莉ｶ: 繝励Ξ繧､繝､繝ｼ遏ｩ蠖｢縺ｨ繝舌ロ遏ｩ蠖｢縺碁㍾縺ｪ縺｣縺ｦ縺・ｋ **縺九▽** `player.vy >= 0`・郁誠荳倶ｸｭ or 髱呎ｭ｢・・
  - 蠑ｾ縺九ｌ縺溽峩蠕後・ `vy < 0` 縺ｫ縺ｪ繧九◆繧√∽ｸ頑・荳ｭ縺ｯ蜀咲匱蜍輔＠縺ｪ縺・ｼ医け繝ｼ繝ｫ繝繧ｦ繝ｳ荳崎ｦ・ｼ・
- 逋ｺ蜍墓凾縺ｮ蜉ｹ譫・
  1. `player.vy = PLAYER_PHYSICS.springBounceVelocity`・・-950`縲る壼ｸｸ繧ｸ繝｣繝ｳ繝・`-720` 繧医ｊ鬮倥＞・・
  2. `player.onGround = false`
  3. `soundManager.onJump()` 繧貞・逕滂ｼ亥ｰら畑縺ｮ SFX JSON 縺ｯ莉雁屓縺ｯ菴懊ｉ縺ｪ縺・ｼ・
  4. 繝舌ロ縺ｮ荳企Κ縺九ｉ荳雁髄縺阪↓繝代・繝・ぅ繧ｯ繝ｫ繧堤匱逕滂ｼ郁牡縺ｯ `h.glowColor` = 繧ｸ繝｣繝ｳ繝ｫ繝代Ξ繝・ヨ縺ｮ safeGlow・・
- **繧ｸ繝｣繝ｳ繝礼憾諷九・豎ｺ螳・*: 繝舌ロ逋ｺ蜍墓凾縺ｫ `jumpsLeft 竊・0`縲～jumpBufferTimer`繝ｻ`coyoteTimer`繝ｻ`jumpHeld` 繧偵け繝ｪ繧｢縺吶ｋ縲・
  縺薙ｌ縺ｫ繧医ｊ繧ｸ繝｣繝ｳ繝礼憾諷九・繧ｷ繝ｳ縺・bounce 縺ｮ騾溷ｺｦ繧偵ず繝｣繝ｳ繝鈴溷ｺｦ縺ｧ荳頑嶌縺搾ｼ・owngrade・峨☆繧九％縺ｨ繧帝亟豁｢縺励・
  `stats.jumps` 縺翫ｈ縺ｳ `onPlayerJump` 繝輔ャ繧ｯ縺檎匱轣ｫ縺励↑縺・％縺ｨ繧剃ｿ晁ｨｼ縺吶ｋ・医ヰ繝阪・逋ｺ蟆・ｺ舌〒縺ゅｊ繧ｸ繝｣繝ｳ繝励〒縺ｯ縺ｪ縺・ｼ峨・
- **蠖｢迥ｶ鬧・虚**: `isHazardous()` 縺ｮ蛻､螳夲ｼ・eat_hazard 蜿崎ｻ｢蜷ｫ繧・・*繧医ｊ蜑・*縺ｫ繝舌ロ蜃ｦ逅・ｒ陦後≧縲・
  蜿崎ｻ｢ON 縺ｧ繧ゅヰ繝阪・蟶ｸ縺ｫ縲悟ｼｾ縺上・辟｡蛯ｷ縲阪・縺ｾ縺ｾ・郁牡縺ｧ縺ｯ縺ｪ縺丞ｽ｢迥ｶ縺ｧ諢丞袖繧呈戟縺､・・
- 讓ｪ繝｢繝ｼ繝会ｼ・_updateHorizontal`・峨→邵ｦ繝｢繝ｼ繝会ｼ・_updateVertical`・峨・荳｡譁ｹ縺ｫ蜷後§蜃ｦ逅・ｒ蜈･繧後ｋ
  ・域ｨｪ繝｢繝ｼ繝峨・ collision 繝ｫ繝ｼ繝励・ sideScroller.ts 邏・822縲・43 陦後∫ｸｦ繝｢繝ｼ繝峨・ 654縲・74 陦鯉ｼ・
- `stats.jumps++` 繧・`onPlayerJump` 繝輔ャ繧ｯ縺ｯ**逋ｺ轣ｫ縺輔○縺ｪ縺・*・医ず繝｣繝ｳ繝玲桃菴懊〒縺ｯ縺ｪ縺・◆繧√・
  繧ｸ繝｣繝ｳ繝怜渚蠢懃ｳｻ Feature 縺ｮ莠碁㍾襍ｷ蜍輔ｒ髦ｲ縺撰ｼ・

### 2.2 繝代Λ繝｡繝ｼ繧ｿ・・SON鬧・虚繝ｻ繝槭ず繝・け繝翫Φ繝舌・遖∵ｭ｢・・

| 繝輔ぃ繧､繝ｫ | 霑ｽ蜉繧ｭ繝ｼ | 蛟､ | 蛯呵・|
|---|---|---|---|
| `src/data/config/physics.json` | `springBounceVelocity` | `-950` | 荳雁髄縺搾ｼ郁ｲ・・|
| `src/data/config/vfx.json` | `springParticleCount` | `10` | |
| 縲・| `springParticleSpeedMin` / `springParticleSpeedMax` | `60` / `200` | 荳雁髄縺肴援迥ｶ |
| 縲・| `springParticleLife` | `0.45` | |
| 縲・| `springParticleSpread` | `2.4` | 繝ｩ繧ｸ繧｢繝ｳ・井ｸ雁髄縺堺ｸｭ蠢・・縺ｰ繧峨▽縺榊ｹ・ｼ・|
| 縲・| `springParticleSize` | `3` | |

蟇ｾ蠢懊☆繧句梛繝ｻ蜀阪お繧ｯ繧ｹ繝昴・繝医・讀懆ｨｼ:

| 繝輔ぃ繧､繝ｫ | 螟画峩 |
|---|---|
| `src/framework/config-types.ts` | `PhysicsConfig` 縺ｫ `springBounceVelocity: number`縲～VfxConfig` 縺ｫ springParticle* 6莉ｶ |
| `src/data/gameBalance.ts` | `PLAYER_PHYSICS` 縺ｫ `springBounceVelocity: _p.springBounceVelocity` |
| `src/framework/ConfigValidator.ts` | `RANGE_CHECKS` 縺ｫ `{ section: 'physics', field: 'springBounceVelocity', max: 0 }`・井ｸ雁髄縺・雋縺ｧ縺ｪ縺代ｌ縺ｰ縺ｪ繧峨↑縺・ｼ・|

### 2.3 RunnerPlugin 繧ｹ繝昴・繝ｳ繝・・繝悶Ν

`src/genres/BasePlugin.ts` 縺ｮ `RunnerPlugin.spawnTable` 縺ｫ霑ｽ蜉:

```ts
{ shape: 'spring', placement: 'ground', weightStart: 0, weightEnd: 2, wRange: [28, 36], hRange: [20, 28], safeChance: 1 }
```

- `weightStart: 0` 竊・繧ｲ繝ｼ繝髢句ｧ狗峩蠕後↓縺ｯ蜃ｺ迴ｾ縺励↑縺・ｼ・istance 3000px 縺ｾ縺ｧ縺ｧ驥阪∩ 2 縺ｫ騾灘｢暦ｼ・
- `safeChance: 1` 竊・**蟶ｸ縺ｫ `isSafe = true`** 縺ｧ蜃ｺ迴ｾ・・spawnHazard 縺ｮ螳牙・濶ｲ邨瑚ｷｯ繧帝壹ｋ縲・
  繝・ぅ繝ｼ繝ｫ邉ｻ縺ｧ謠冗判縺輔ｌ縲√悟ｮ牙・濶ｲ=隗ｦ繧後※繧医＞縲阪→縺・≧譌｢蟄倥・隕冶ｦ夊ｨ隱槭→荳閾ｴ縺吶ｋ・・
- `hRange: [20, 28]` 竊・繝励Ξ繧､繝､繝ｼ鬮倥＆・・2・峨ｈ繧贋ｽ弱＞縲る壼ｸｸ繧ｸ繝｣繝ｳ繝暦ｼ郁ｷｳ縺ｭ邏・62px・峨〒菴呵｣輔〒雜翫∴繧峨ｌ繧・

### 2.4 謠冗判

- `_drawHazard` 縺ｮ switch 縺ｫ蟆ら畑蛻・ｲ舌・**霑ｽ蜉縺励↑縺・*縲Ｅefault 縺ｮ rect 邨瑚ｷｯ縺ｧ謠冗判・亥ｮ牙・濶ｲ縺ｧ蜊∝・隱ｭ繧√ｋ・・
- 蟆・擂謾ｹ蝟・呵｣・ 繧ｳ繧､繝ｫ迥ｶ縺ｮ蟆ら畑 `_drawSpring`・医ラ繧ｭ繝･繝｡繝ｳ繝医・縲御ｻ雁ｾ後・謾ｹ蝟・呵｣懊阪↓譏手ｨ假ｼ・

### 2.5 險ｭ險亥愛譁ｭ縺ｮ險倬鹸

1. **繝舌ロ蛻､螳壹・菴咲ｽｮ**: 陦晉ｪ√Ν繝ｼ繝怜・繝ｻ`isHazardous()` 縺ｮ逶ｴ蜑阪Ａcontinue` 縺ｧ陲ｫ蠑ｾ繝ｻsafe-touch 縺ｮ
   荳｡譁ｹ繧堤ｵ檎罰縺励↑縺・ｼ・earMissComboFeature 縺ｯ `world.hazards` 繧堤峩謗･襍ｰ譟ｻ縺吶ｋ縺溘ａ蠖ｱ髻ｿ縺ｪ縺暦ｼ峨・
2. **辟｡謨ｵ譎る俣荳ｭ縺ｮ繝舌ロ**: 迴ｾ迥ｶ繝ｫ繝ｼ繝励・ `p.invincible <= 0` 繧ｬ繝ｼ繝牙・縺ｫ縺ゅｋ縺溘ａ縲∫┌謨ｵ荳ｭ縺ｯ繝舌ロ縺・
   蜉ｹ縺九↑縺・３unner 縺ｫ縺ｯ hp feature 縺後↑縺丈ｸ謦・〒邨ゅｏ繧九◆繧∬ｨｱ螳ｹ縺吶ｋ・域怙蟆丞ｷｮ蛻・━蜈茨ｼ峨・
   繝峨く繝･繝｡繝ｳ繝医・縲悟ｮ溯｣・ｸ翫・豕ｨ諢冗せ縲阪↓譏手ｨ倥☆繧九％縺ｨ縲・
3. **蟆ら畑 SFX 縺ｪ縺・*: `onJump()` 繧呈ｵ∫畑・医ち繧ｹ繧ｯ謖・､ｺ縺ｩ縺翫ｊ・峨ょｰら畑 JSON 縺ｯ蠕悟屓縺励・

## 3. 繝峨く繝･繝｡繝ｳ繝・

### 3.1 `docs/genre/runner-genre.md`・域眠隕丈ｽ懈・・・

> 豕ｨ: 譌｢蟄倥・ `Runner.md` 縺ｯ繝ｪ繝昴ず繝医Μ縺ｫ蟄伜惠縺励↑縺・◆繧√√檎ｧｻ蜍輔阪〒縺ｯ縺ｪ縺乗眠隕丈ｽ懈・縺吶ｋ縲・

`docs/genre/tetris-genre.md` 縺ｨ蜷後§蠖｢蠑上〒**螳溯｣・ｒ險倬鹸**縺吶ｋ・郁ｨｭ險医〒縺ｯ縺ｪ縺丞ｮ滄圀縺ｮ螳溯｣・ｼ峨・
譛菴朱剞莉･荳九・繧ｻ繧ｯ繧ｷ繝ｧ繝ｳ:

- 讎りｦ・
- 繧｢繝ｼ繧ｭ繝・け繝√Ε・医ヵ繧｡繧､繝ｫ讒区・: entities.ts / physics.json / vfx.json / gameBalance.ts /
  config-types.ts / ConfigValidator.ts / sideScroller.ts / BasePlugin.ts / runner.json・・
- 繧ｸ繝｣繝ｳ繝ｫ蜿取據譚｡莉ｶ・・runner.json` 縺ｮ `thresholds: { tempo: 8 }`縲》empo 繧貞刈邂励☆繧九き繝ｼ繝我ｾ・
  `c-tempo-smooth` +2 / `c-tempo-speed` +3 / `c-rhythm-beat` +1 遲会ｼ・
- 繧ｲ繝ｼ繝莉墓ｧ假ｼ域桃菴・ 閾ｪ蜍戊ｵｰ陦・+ Space 繧ｸ繝｣繝ｳ繝・莠梧ｮｵ繧ｸ繝｣繝ｳ繝励ゅさ繝ｨ繝ｼ繝・繝舌ャ繝輔ぃ縲・
  long_air 繧ｹ繧ｳ繧｢縲Ｏear_miss_combo縲・*繝舌ロ縺ｮ謖吝虚縺ｨ謨ｰ蛟､**・・
- 螳溯｣・ｸ翫・豕ｨ諢冗せ・按ｧ2.5 縺ｮ險ｭ險亥愛譁ｭ + `isSafe`/`safeChance` 縺ｮ髢｢菫・+ 辟｡謨ｵ譎る俣荳ｭ縺ｮ髱槫虚菴懶ｼ・
- 繝・せ繝茨ｼ按ｧ4 縺ｮ繝・せ繝井ｸ隕ｧ縺ｨ邨先棡・・

### 3.2 `docs/genre/README.md`

繝峨く繝･繝｡繝ｳ繝井ｸ隕ｧ縺ｮ陦ｨ縺ｫ `runner` 縺ｮ陦後ｒ霑ｽ蜉:
`| runner | docs/genre/runner-genre.md（docs/genre/ 配下） | 繧ｨ繝ｳ繝峨Ξ繧ｹ繝ｩ繝ｳ繝翫・・郁・蜍戊ｵｰ陦後・莠梧ｮｵ繧ｸ繝｣繝ｳ繝励・繝舌ロ・・|`

## 4. 繝・せ繝・

### 4.1 繝ｦ繝九ャ繝医ユ繧ｹ繝・`tests/unit/game/SpringFeature.test.ts`・域眠隕擾ｼ・

繝代ち繝ｼ繝ｳ蜿ら・: `tests/unit/game/multiHitGuard.test.ts`
・・new SideScroller(canvas, rules)` + private 繝｡繧ｽ繝・ラ蜻ｼ縺ｳ蜃ｺ縺励・
`any` 繧剃ｽｿ繧上★縲～scroller as unknown as { ... }` 縺ｮ蝙倶ｻ倥″繧ｭ繝｣繧ｹ繝医〒 private 縺ｸ繧｢繧ｯ繧ｻ繧ｹ縺吶ｋ・・

蠢・医ユ繧ｹ繝・

1. **繝舌ロ縺後・繝ｬ繧､繝､繝ｼ繧貞ｼｾ縺・*: 關ｽ荳倶ｸｭ・・vy > 0`・頴r 謗･蝨ｰ縺ｧ繝舌ロ縺ｨ驥阪↑縺｣縺溘・繝ｬ繧､繝､繝ｼ縺・
   `_updateHorizontal` 1 繝輔Ξ繝ｼ繝蠕後↓ `vy === PLAYER_PHYSICS.springBounceVelocity`縲・
   `onGround === false` 縺ｫ縺ｪ繧・
2. **繝舌ロ縺ｯ繝励Ξ繧､繝､繝ｼ縺ｫ繝繝｡繝ｼ繧ｸ繧剃ｸ弱∴縺ｪ縺・*: 繝舌ロ縺ｨ驥阪↑繧狗憾諷九〒 `_updateHorizontal` 繧貞ｮ溯｡後＠縺ｦ繧・
   `stats.collisions === 0`縲～dead === false`縲？P 螟牙喧縺ｪ縺・
3. **繝舌ロ縺ｮ霍ｳ縺ｭ騾溷ｺｦ縺ｯ騾壼ｸｸ繧ｸ繝｣繝ｳ繝励ｈ繧企ｫ倥＞**:
   `PLAYER_PHYSICS.springBounceVelocity < PLAYER_PHYSICS.jumpVelocity`
   ・医▽縺ｾ繧顔ｵｶ蟇ｾ蛟､縺ｧ 950 > 720・・

霑ｽ蜉繝・せ繝茨ｼ域耳螂ｨ繝ｻ螳溯｣・ｮｹ譏薙↑繧ゅ・):

4. 荳頑・荳ｭ・・vy < 0`・峨・繝舌ロ縺ｯ蜀咲匱蜍輔＠縺ｪ縺・
5. 邵ｦ繝｢繝ｼ繝会ｼ・_updateVertical`・峨〒繧ゅヰ繝阪′蠑ｾ縺・

### 4.2 讀懆ｨｼ繧ｳ繝槭Φ繝・

- `npx vitest run`・亥・繝ｦ繝九ャ繝医ユ繧ｹ繝医′騾壹ｋ縺薙→・・
- `npm run build`・・ue-tsc + vite build・・
- `npm run lint`
- `npm run validate`

### 4.3 隕冶ｦ夂｢ｺ隱搾ｼ亥ｮ溯｣・ｾ後・讀懆ｨｼ繝輔ぉ繝ｼ繧ｺ縺ｧ螳滓命・・

- dev 繧ｵ繝ｼ繝占ｵｷ蜍包ｼ・DEBUG_MODE = import.meta.env.DEV` 縺ｧ dev 迺ｰ蠅・〒縺ｯ繝・ヰ繝・げ繝代ロ繝ｫ蜃ｺ迴ｾ・・
- 繝・ヰ繝・げ繝代ロ繝ｫ縺ｮ `force genre` 縺ｧ `runner` 繧貞ｼｷ蛻ｶ
- 繧ｹpring・医ユ繧｣繝ｼ繝ｫ濶ｲ縺ｮ遏ｩ蠖｢・峨′蝨ｰ髱｢縺ｫ蜃ｺ迴ｾ縺吶ｋ縺薙→縲√・繝ｬ繧､繝､繝ｼ縺瑚ｸ上・縺ｨ鬮倥￥蠑ｾ縺九ｌ繧九％縺ｨ繧・
  繧ｹ繧ｯ繝ｪ繝ｼ繝ｳ繧ｷ繝ｧ繝・ヨ/蜍慕判縺ｧ遒ｺ隱・

## 5. 螟画峩繝輔ぃ繧､繝ｫ荳隕ｧ・域Φ螳夲ｼ・

| 繝輔ぃ繧､繝ｫ | 遞ｮ蛻･ |
|---|---|
| `src/game/entities.ts` | 菫ｮ謾ｹ・・HazardShape` 縺ｫ `'spring'`・・|
| `src/data/config/physics.json` | 菫ｮ謾ｹ・・springBounceVelocity: -950`・・|
| `src/data/config/vfx.json` | 菫ｮ謾ｹ・・pringParticle* 6莉ｶ・・|
| `src/framework/config-types.ts` | 菫ｮ謾ｹ・・hysicsConfig / VfxConfig・・|
| `src/data/gameBalance.ts` | 菫ｮ謾ｹ・・LAYER_PHYSICS・・|
| `src/framework/ConfigValidator.ts` | 菫ｮ謾ｹ・・ANGE_CHECKS 1莉ｶ・・|
| `src/game/sideScroller.ts` | 菫ｮ謾ｹ・域ｨｪ/邵ｦ collision 繝ｫ繝ｼ繝・+ `_onSpringBounce` 繝倥Ν繝代・・・|
| `src/genres/BasePlugin.ts` | 菫ｮ謾ｹ・・unnerPlugin.spawnTable 1陦鯉ｼ・|
| `tests/unit/game/SpringFeature.test.ts` | 譁ｰ隕・|
| `docs/genre/runner-genre.md` | 譁ｰ隕・|
| `docs/genre/README.md` | 菫ｮ謾ｹ・育ｴ｢蠑・陦鯉ｼ・|

## 6. 繧ｳ繝ｼ繝・ぅ繝ｳ繧ｰ隕冗ｴ・ｼ亥・遒ｺ隱搾ｼ・

- `any` 蝙狗ｦ∵ｭ｢・・SLint `@typescript-eslint/no-explicit-any`: error縲ゅユ繧ｹ繝医ｂ `any` 荳堺ｽｿ逕ｨ・・
- 繧ｽ繝ｼ繧ｹ蜀・・謨ｰ蛟､繝ｪ繝・Λ繝ｫ遖∵ｭ｢ 竊・蠢・★ JSON 險ｭ螳夂ｵ檎罰・・PLAYER_PHYSICS` / `VFX`・・
- 驥崎､・Ο繧ｸ繝・け・域ｨｪ/邵ｦ縺ｧ蜷後§繝舌ロ蜃ｦ逅・ｼ峨・ `_onSpringBounce` 繝倥Ν繝代・縺ｫ謚ｽ蜃ｺ
- 繧ｳ繝｡繝ｳ繝医・縲後↑縺懊阪□縺代ょ多蜷崎ｦ丞援縺ｯ譌｢蟄倥↓蠕薙≧・・rivate 縺ｯ `_` 繝励Ξ繝輔ぅ繝・け繧ｹ・・
