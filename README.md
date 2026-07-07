# 待办事项

Next.js + React + TypeScript 项目。

## 功能

- 任务新增、删除、编辑、完成状态切换
- 每天首次打开或回到页面时自动清除昨日完成状态
- 数据写入项目根目录的 `db.json`
- 保留 JSON 导入/导出，结构仍为：

```json
{
  "todos": [],
  "lastClearDate": null
}
```

## 运行

```bash
npm install
npm run dev
```

默认访问 `http://localhost:3000`。

## 预览效果
<img width="401" height="485" alt="image" src="https://github.com/user-attachments/assets/a70ee30b-8263-4862-8de3-959225c75871" />
