这是一个 pi 插件项目，提供三个 powerline 风格的 UI 扩展：编辑器、底部栏、页头。

## 项目结构

```
.
├── AGENTS.md               # 项目协作规则（本文件）
├── README.md               # 安装、使用、开发说明
├── package.json            # npm 包声明，"pi" 字段指向 index.ts 入口
├── index.ts                # 唯一入口，汇总注册三个扩展
├── editor.ts               # 编辑器扩展（PromptPrefixEditor）
├── footer.ts               # 底部栏扩展（token 统计 + git 分支）
├── header.ts               # 页头扩展（渐变色 PI logo）
├── tests/
│   ├── editor.test.ts
│   ├── footer.test.ts
│   └── header.test.ts
├── .pi/
│   ├── settings.json       # pi 项目级配置
│   ├── APPEND_SYSTEM.md    # 追加到 system prompt 的内容
│   └── extensions/
│       └── auto-format.ts  # 编辑 ts 文件后自动 prettier
├── tsconfig.json           # LSP 类型解析（gitignored，每人按自己 pi 安装路径创建）
└── .gitignore
```

## 架构说明

- `index.ts` 是 pi 包唯一入口，`package.json` 中 `"pi": { "extensions": ["./index.ts"] }` 声明
- 每个扩展模块导出 `registerXxx(pi)` 函数，由 index.ts 统一调用
- 辅助函数内联在各模块中，不单独拆文件

## 工具链

- 运行时使用 **bun**（`bun test`、`bun prettier`）
- `.pi/extensions/auto-format.ts` — edit/write 工具操作 ts 文件后自动 prettier
- `simple-git-hooks` — git commit 前自动 prettier check + bun test + commitlint
- 测试使用 `bun test`（兼容 node:test 语法）
- 格式化配置：单引号、分号、尾随逗号、2 空格缩进、lf 换行、100 字符宽

## 协作规则

### 编辑

- 文档默认使用简洁中文
- 代码使用 2 空格缩进
- 代码注释必须使用英文
- 注释力求简洁
- 编辑 `.ts` / `.json` 文件后，必须运行三轮检查：
  1. `bun prettier --write <files>` — 格式化
  2. `bun tsc --noEmit --ignoreDeprecations 6.0` — 类型检查
  3. `bun test` — 单元测试

### 创建

- 创建文件前，必须先检查目标文件是否已经存在，避免重复创建、误覆盖或制造重复文件

### 搜索

- 默认不全库扫描，按任务读取相关笔记与必要索引
- 搜索文件内容优先使用 `rg`（ripgrep），而非 `find` 或 `grep`
- 获取 GitHub 仓库信息优先使用 `gh`
