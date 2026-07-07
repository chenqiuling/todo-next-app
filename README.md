# 待办事项

Next.js + React + TypeScript 项目。

## 功能

- 任务新增、删除、编辑、完成状态切换
- 每天首次打开或回到页面时自动清除昨日完成状态
- 数据写入写本地文件的 `db.json`，浏览器不支持时，页面会退回到浏览器本地存储
- 保留 JSON 导入/导出/复制，结构为：

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

<img width="401" height="593" alt="image" src="https://github.com/user-attachments/assets/904c5613-723e-4db2-8224-fda1e287a089" />

[访问地址](https://chenqiuling.github.io/todo-next-app/)
