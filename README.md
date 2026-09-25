<div align="center">

# Jev Game Theory Lab · Jev 博弈实验室

**Play classic game-theory games against Jev, an AI that thinks in probabilities.**
与用概率思考的 AI 对弈：德州扑克、吹牛骰子、囚徒困境……

### [▶ Play now · 立即开玩](https://jev-game-theory-arena.pages.dev/)

Free · No sign-up · English / 中文 · Desktop & mobile

[English](#english) · [中文](#中文)

</div>

---

## English

### What is this?

[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) is a new kind of AI model from TypeSafe AI. It doesn't chat. You give it a situation and a list of options, and it gives each option a probability.

That makes it an interesting game-theory player. After each round you can see its full probability distribution: where it's confident, where it hesitates, and where you can exploit it. Each visit is randomly assigned how Jev turns those probabilities into a move: **Top pick** (always its highest-rated move) or **By odds** (drawn in proportion to its probabilities).

### Six games

| | Game | What it teaches |
|---|---|---|
| ♠ | **Heads-up No-Limit Hold'em**: bet any amount, go all-in | Bluffing and imperfect information |
| ⚅ | **Liar's Dice**: five dice under a cup; bid or call "Liar!" | Bluffing and reasoning from partial information |
| ⚑ | **Colonel Blotto**: split 10 soldiers across 3 battlefields | Why no fixed plan is ever safe |
| ▦ | **Prisoner's Dilemma**: ten rounds of cooperate or defect | Trust, reputation and repeated games |
| △ | **Rock · Paper · Scissors**: Jev predicts your next throw | Nash equilibrium and exploiting patterns |
| ⚖ | **Ultimatum Game**: split 10 coins; the other side can say no | Fairness versus "rational" play |

### Two ways Jev can play

- **Raw mode**: Jev sees only what happened (every move so far and the scores) and the options it has. It plays on intuition, so it's often more human and easier to exploit.
- **Hinted mode**: the game does the maths first (hand strength, odds, patterns in your play) and gives Jev a short summary. Jev decides with that help.

There's also **Practice mode**, where a built-in algorithm plays instead of Jev, with no limits. Switch modes on any game page. Which Jev is harder to beat?

### Just a game

This is an educational project for learning game theory. **No real money, betting, payments or prizes are involved.** All chips, coins and points are virtual and have no value.

### Run it yourself

It's a static website with no build step:

```bash
git clone https://github.com/OuchengLiu/Jev-Game-Theory-Arena.git
cd Jev-Game-Theory-Arena
python3 -m http.server 8000      # open http://localhost:8000
```

Running an unmodified copy locally for personal evaluation is fine; without a Jev connection a built-in practice bot plays instead. Public deployments need permission (see below).

### License, reuse and citation

The source is public so people can read it, learn from it and discuss it, but this is **not open-source software**. See [LICENSE](LICENSE):

- ✅ Reading, discussing, playing on the official site, running an unmodified copy locally for personal use, and referring to the project with a citation.
- ✉️ **Ask first** before copying or modifying the code, redistributing or deploying it, or using any part of it — code, prompts, experimental design or collected data — in research, papers, preprints, benchmarks or datasets.

To ask for permission, report a bug or suggest an idea, please [open an issue](https://github.com/OuchengLiu/Jev-Game-Theory-Arena/issues). Collaboration is welcome. If you refer to the project, please cite it ([CITATION.cff](CITATION.cff)).

---

## 中文

### 这是什么？

[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) 是 TypeSafe AI 推出的一种新型 AI 模型。它不聊天：给它一个局面和一组选项，它会为每个选项给出一个概率。

这让它成为一个很有意思的博弈对手：每一轮结束后你都能看到它完整的概率分布，知道它哪里有把握、哪里在犹豫、哪里能被你利用。Jev 怎么把概率变成出招，会在每次访问时随机分配：**取最高**（总是出概率最高的那一招）或**按概率**（按它给出的概率按比例抽取）。

### 六款游戏

| | 游戏 | 能学到什么 |
|---|---|---|
| ♠ | **单挑无限注德州**：自由下注，可以全下 | 诈唬与不完全信息 |
| ⚅ | **吹牛骰子**：五颗骰子扣在盅里，叫点还是“开！” | 诈唬，以及根据部分信息做推断 |
| ⚑ | **布洛托上校**：把 10 名士兵分到 3 个战场 | 为什么任何固定打法都不安全 |
| ▦ | **囚徒困境**：十回合，合作还是背叛 | 信任、声誉与重复博弈 |
| △ | **石头剪刀布**：Jev 预测你下一手出什么 | 纳什均衡，以及如何利用对手的规律 |
| ⚖ | **最后通牒博弈**：分 10 枚金币，对方可以拒绝 | 公平与“理性”之间的取舍 |

### Jev 的两种玩法

- **直觉模式**：Jev 只看到发生过的事（之前的每一步、双方比分）和当前可选的动作，全凭直觉判断。这样往往更像人，也更容易被你抓住破绽。
- **提示模式**：游戏先把数算好（牌力、概率、你的出招规律），整理成简短的提示交给 Jev，它在这些帮助下做决定。

另外还有**练习模式**：不连接 Jev，由内置算法陪你玩，不限次数。每个游戏页面都可以切换模式。你觉得哪个 Jev 更难对付？

### 只是游戏

这是一个学习博弈论的教育项目，**不涉及任何真实金钱、赌注、支付或奖品**。所有筹码、金币和分数都是虚拟的，没有任何价值。

### 自己运行

纯静态网站，不需要构建：

```bash
git clone https://github.com/OuchengLiu/Jev-Game-Theory-Arena.git
cd Jev-Game-Theory-Arena
python3 -m http.server 8000      # 然后打开 http://localhost:8000
```

在本地运行未经修改的副本、仅供个人体验是可以的；没有接入 Jev 时，由内置的练习机器人陪你玩。公开部署需要事先获得许可（见下文）。

### 许可、复用与引用

源码公开是为了方便大家阅读、学习和交流，但本项目**不是开源软件**，详见 [LICENSE](LICENSE)：

- ✅ 阅读、讨论、在官方网站上玩、在本地运行未经修改的副本供个人体验，以及注明出处地提及本项目。
- ✉️ 以下行为请**先征得同意**：复制或修改代码、再分发或部署，以及在研究、论文、预印本、基准测试或数据集中使用本项目的任何部分，包括代码、提示词、实验设计和收集的数据。

申请许可、报告 bug 或提建议，请[提交 issue](https://github.com/OuchengLiu/Jev-Game-Theory-Arena/issues)，也欢迎合作。如果在文章中提及本项目，请注明出处（[CITATION.cff](CITATION.cff)）。

---

<div align="center">

© 2026 Jev Game Theory Lab authors · All rights reserved ([LICENSE](LICENSE)) · Unofficial community project, not affiliated with TypeSafe AI
保留所有权利 · 非官方社区项目，与 TypeSafe AI 无关联

<sub>canary GUID JGTL-CANARY-7c006748-fdca-49c4-ba68-4f6b9bd0cd16</sub>

</div>
