# Rose & Blade Online — 游戏规则整理

> 本文档根据项目 Prompt 整理，用于实现房主浏览器权威的 Game Engine。
> 若与后续官方规则冲突，以最终确认的规则为准。

## 1. 阵营

- WHITE_ROSE（白蔷薇阵营）
  - WHITE_ROSE
  - BISHOP
  - BELIEVER
- BLOOD_BLADE（血刃阵营）
  - DOUBLE_KNIFE
  - GREAT_SWORD
  - DARK_KNIFE
- GHOST 不是玩家身份，只是一种手牌。

## 2. 人数与身份配置

| 玩家数 | WHITE_ROSE | BISHOP | BELIEVER | GREAT_SWORD | DOUBLE_KNIFE | DARK_KNIFE |
|---:|---:|---:|---:|---:|---:|---:|
| 5 | 1 | 1 | 1 | 0 | 1 | 1 |
| 6 | 1 | 1 | 2 | 0 | 1 | 1 |
| 7 | 1 | 1 | 2 | 1 | 1 | 1 |
| 8 | 1 | 1 | 3 | 1 | 1 | 1 |
| 9 | 1 | 1 | 3 | 2 | 1 | 1 |
| 10 | 1 | 1 | 4 | 2 | 1 | 1 |

身份在整局游戏中不变。

## 3. 胜利阈值

| 玩家数 | 白方献祭阈值 | 血方死亡阈值 |
|---:|---:|---:|
| 5 | 3 | 4 |
| 6 | 4 | 4 |
| 7 | 4 | 6 |
| 8 | 5 | 6 |
| 9 | 5 | 7 |
| 10 | 6 | 7 |

> ✅ 6 人局阈值已确认：使用 **4 / 4**。

## 4. 身份与手牌分离

每个玩家永久拥有：

- role
- faction

即使角色牌被打出，role/faction 不改变。

## 5. 初始手牌

每名玩家初始获得：

- BELIEVER × 1
- GHOST × 1
- 自己的身份牌 × 1

示例：

- BELIEVER 身份：BELIEVER + BELIEVER + GHOST
- WHITE_ROSE：WHITE_ROSE + BELIEVER + GHOST
- DARK_KNIFE：DARK_KNIFE + BELIEVER + GHOST

## 6. DOUBLE_KNIFE 夜晚规则

夜晚阶段，DOUBLE_KNIFE 玩家将手牌中的 GHOST 替换为 DOUBLE_KNIFE。

最终手牌：DOUBLE_KNIFE + DOUBLE_KNIFE + BELIEVER。

该操作由服务器自动完成。

## 7. 夜晚信息

游戏开始后只执行一次夜晚阶段。

以下身份互相看到“哪些玩家参加了夜间睁眼”：

- WHITE_ROSE
- BISHOP
- DOUBLE_KNIFE
- GREAT_SWORD

他们只能知道夜间睁眼玩家集合，不能知道每个人的具体身份。

BELIEVER 和 DARK_KNIFE 不获得该信息。

## 8. 回合状态机

至少包含：

- LOBBY
- SETUP
- NIGHT_RECOGNITION
- NIGHT_DOUBLE_KNIFE
- ROUND_MAGIC_SELECT
- MAGIC_RESOLUTION
- PLAYER_ACTIONS
- PRE_REVEAL_MAGIC
- ROUND_REVEAL
- ROUND_RESOLUTION
- CHECK_VICTORY
- GAME_OVER

## 9. 水晶阶段

每位玩家拥有 1 个隐藏水晶。

- 水晶号码从 1–12 中随机、不重复分发。
- 未使用水晶对其他玩家不可见。
- 金币持有人选择一名其他且仍然拥有水晶的玩家，将金币交给该玩家；不能把金币交给自己。
- 该玩家公开水晶数字，水晶标记为 used，号码加入 public crystal history。
- 强制执行对应魔法。

玩家不得主动向其他玩家公开自己的未使用水晶号码。

## 10. 12 个魔法效果

| # | 效果 |
|---|---|
| 1 | 选择另外一名仍有手牌的玩家，该玩家本轮必须出牌，不能 Pass。 |
| 2 | 本轮出牌在 Reveal 时不进行 Shuffle，保留牌与出牌玩家的对应关系并公开。 |
| 3 | 发动者右侧玩家必须随机打出一张手牌，不能自主选择；无手牌则 Pass。 |
| 4 | 发动者左侧玩家必须随机打出一张手牌；无牌则 Pass。 |
| 5 | 选择另外两个仍有手牌的玩家 A、B；行动顺序较早者为 A；如果 A 出牌则 B 必须出牌，如果 A Pass 则 B 必须 Pass；只要求行动类型一致，不要求牌面一致。 |
| 6 | 发动者可选：保持正常首位行动，或将自己的行动移动至本轮最后。 |
| 7 | 选择一名其他玩家，其手牌增加 GHOST × 1。 |
| 8 | 发动者左邻和右邻本轮必须出牌；无手牌则 Pass。 |
| 9 | DARK_KNIFE 获得私人信息：下面两人分别是 WHITE_ROSE 和 BISHOP，但不知道谁是谁。 |
| 10 | 所有人完成 PLAYER_ACTIONS 后、Reveal 前，发动者可选：不发动，或指定一名已经出牌且当前仍至少剩一张手牌的其他玩家；被选玩家收回本轮刚出的牌，从剩余手牌选择一张牌（包括与刚出牌面相同但属于另一张实体牌的牌），暗置提交。 |
| 11 | 指定一名其他玩家，服务器随机选取其一张当前手牌，仅发动者可以查看牌面，之后牌返回原玩家手中。 |
| 12 | 与 Magic 1 相同：指定一名还有手牌的其他玩家，本轮必须出牌。 |

### 魔法强制性

- Magic 6、Magic 10 允许玩家选择。
- 其他魔法只要存在合法执行条件就必须执行。
- 如果不存在合法目标，直接结束魔法解析并进入 PLAYER_ACTIONS。

## 11. 玩家行动阶段

- 从本轮金币接收者开始，按座位顺时针行动。
- 每位玩家一次行动。
- 基本动作：PLAY_CARD、PASS。
- PLAY_CARD：从当前手牌选择一张牌暗置提交；其他玩家只能知道“该玩家已经出牌”，不能知道牌面。
- PASS：本轮不出牌。
- 后续玩家可以看到此前玩家是 PLAYED 还是 PASS。
- 服务器必须验证所有魔法约束。

## 12. Reveal

所有玩家行动完成后：

- 正常：收集本轮所有暗置牌，服务器随机 Shuffle，向所有玩家公开结果。
- Magic 2 生效时：不得 Shuffle，并显示 Player → Card 映射。
- 如果所有玩家都 Pass：跳过 Reveal 与牌面结算。

## 13. 牌面结算

定义：

- hasBloodBlade：翻开的牌中有任意血刃牌（DOUBLE_KNIFE / GREAT_SWORD / DARK_KNIFE）
- hasWhiteRose：翻开的牌中有 WHITE_ROSE
- budCount：BELIEVER + BISHOP 的数量；WHITE_ROSE 不计入 BUD。

### 无 Blood Blade

- WHITE_ROSE → whiteRoseSafe = true（White Rose Safe Zone）
- BELIEVER / BISHOP → Sacrifice Pile
- GHOST → Discard / Outside Board

### 有 Blood Blade，但没有 WHITE_ROSE

- 所有 BELIEVER / BISHOP 进入 Death Pile。
- 所有 Blood Blade 牌进入 Blade Pile。
- GHOST 无效果并弃置。
- 多张 Blood Blade 不产生额外伤害倍率，只判断 hasBloodBlade。

### WHITE_ROSE + Blood Blade

- 同一 Reveal 同时存在 WHITE_ROSE 和任意血刃牌，立即 BLOOD_BLADE 胜利，reason = WHITE_ROSE_KILLED。

## 14. 胜利条件

### WHITE_ROSE 胜利

普通白方胜利必须同时满足：

- whiteRoseSafe === true
- sacrificeBudCount >= sacrificeThreshold

WHITE_ROSE 本身不计入 budCount；BISHOP 和 BELIEVER 均计数。

### BLOOD_BLADE 胜利

任一成立：

- WHITE_ROSE 被血刃同轮击杀
- deathBudCount >= deathThreshold

## 15. 最终水晶判定

当所有玩家都已经使用水晶后，当前轮仍然完整执行。

如果当前轮结束时双方普通胜利条件均未满足，服务器检查：

- 所有 WHITE_ROSE faction 玩家剩余的全部手牌
- 如果其中 WHITE_ROSE == 0 且 BISHOP + BELIEVER == 0
  - WHITE_ROSE faction wins
- 否则 BLOOD_BLADE faction wins

注意：必须依据玩家永久 faction 判断哪些手牌需要加入终局检查，不能依据当前手牌推导阵营。

## 16. 公开信息

- 昵称、座位、连接状态
- 当前金币持有人
- 每名玩家当前手牌数量
- 每名玩家是否还有水晶
- 已公开水晶
- 当前回合数
- 谁本轮 PLAYED / PASS
- Sacrifice Pile、Death Pile、Blade Pile
- White Rose 是否已经安全
- 游戏公开日志

## 17. 秘密信息

普通客户端只能获得属于自己的：

- role
- faction
- hand
- crystal

以及自己拥有权限看到的：

- Night Recognition
- Magic 9
- Magic 11

不得把其他玩家隐藏信息发送到浏览器后再通过 CSS/前端 state 隐藏。

## 18. 游戏内语音

- 大厅阶段为 `FREE_CHAT`，玩家可以自行开关自己的麦克风。
- 游戏开始后夜间、魔法、出牌、揭示和结算阶段均为 `MUTED`。
- 首轮相认完成后进入 `FIRST_SPEAKING_PHASE`，从房主（房间首位玩家）开始按座位顺序轮流发言。
- 每名玩家最多发言 60 秒，可以主动结束；倒计时结束时自动进入下一位。
- 每轮结算后进入 `ROUND_SPEAKING_PHASE`，当前金币持有者选择第一位发言玩家及顺/逆时针方向。
- 轮麦结束后进入 `COIN_OWNER_SUMMARY_PHASE`，金币持有者额外总结发言 60 秒。
- 总结结束后进入下一轮水晶选择（现有 `ROUND_MAGIC_SELECT` 阶段）。
- 发言人、发言顺序、倒计时和阶段由房主 Game Engine 权威状态控制，客户端不能自行解除禁音。
- 浏览器通过 `getUserMedia({ audio: true })` 获取麦克风，音频媒体使用 `RTCPeerConnection`，信令通过现有房主中继网络转发。
