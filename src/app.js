const express = require("express");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");

require("./db");

const linesRouter = require("./routes/lines");
const towersRouter = require("./routes/towers");
const segmentsRouter = require("./routes/segments");
const crossingsRouter = require("./routes/crossings");
const hazardsRouter = require("./routes/hazards");
const { router: tasksRouter, generateTasks } = require("./routes/tasks");
const recordsRouter = require("./routes/records");
const { router: defectsRouter } = require("./routes/defects");
const statsRouter = require("./routes/stats");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/", (req, res) => {
  res.json({
    name: "风电送出线路巡检后端系统",
    version: "1.0.0",
    description:
      "四十多公里送出线路巡检管理：分段建档、任务派发、巡检上报、缺陷工单、统计分析",
    endpoints: {
      lines: "/api/lines - 线路管理",
      towers: "/api/towers - 杆塔管理",
      segments: "/api/segments - 区段管理（含跨越点、隐患点）",
      crossings: "/api/crossings - 跨越点管理",
      hazards: "/api/hazards - 隐患点管理",
      tasks: "/api/tasks - 巡检任务（POST /generate 按周期生成）",
      records: "/api/records - 巡检记录（绝缘子/金具/弧垂/塔基/树障）",
      defects: "/api/defects - 缺陷工单（一般/严重/危急分级，复核关闭）",
      stats: {
        summary: "/api/stats/summary - 总体概况",
        "defect-density": "/api/stats/defect-density - 缺陷密度",
        "repair-duration": "/api/stats/repair-duration - 平均消缺时长",
        overdue: "/api/stats/overdue - 超期未处理",
        availability: "/api/stats/availability - 线路可用率",
      },
    },
  });
});

app.use("/api/lines", linesRouter);
app.use("/api/towers", towersRouter);
app.use("/api/segments", segmentsRouter);
app.use("/api/crossings", crossingsRouter);
app.use("/api/hazards", hazardsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/records", recordsRouter);
app.use("/api/defects", defectsRouter);
app.use("/api/stats", statsRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || "服务器内部错误" });
});

cron.schedule("0 6 * * *", () => {
  console.log(`[${new Date().toLocaleString("zh-CN")}] 自动生成巡检任务...`);
  try {
    generateTasks();
    console.log("巡检任务生成完成");
  } catch (e) {
    console.error("巡检任务生成失败:", e.message);
  }
});

app.listen(PORT, () => {
  console.log("=".repeat(60));
  console.log("  风电送出线路巡检后端系统 已启动");
  console.log(`  服务地址: http://localhost:${PORT}`);
  console.log("=".repeat(60));

  const dbPath = path.join(__dirname, "..", "data", "inspection.db");
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size < 10000) {
    console.log("\n  检测到数据库为空，正在写入种子数据...");
    require("./seed");
  }
  console.log(`\n  数据库文件: ${dbPath}`);
  console.log("  每日 6:00 自动生成巡检任务");
  console.log("=".repeat(60));
});
