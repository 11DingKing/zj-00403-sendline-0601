const express = require("express");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");

const db = require("./db");

const linesRouter = require("./routes/lines");
const towersRouter = require("./routes/towers");
const { router: segmentsRouter } = require("./routes/segments");
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

app.get("/api", (req, res) => {
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
        "flood-risk": "/api/stats/flood-risk - 汛期通道风险",
      },
    },
  });
});

app.get("/", (req, res) => {
  const isFloodSeason = db.isFloodSeason();

  const summary = db
    .prepare(
      `
    SELECT 
      (SELECT COUNT(*) FROM lines) as lines,
      (SELECT COUNT(*) FROM towers) as towers,
      (SELECT COUNT(*) FROM segments) as segments,
      (SELECT COUNT(*) FROM inspection_tasks) as total_tasks,
      (SELECT COUNT(*) FROM inspection_tasks WHERE status = '待执行') as pending_tasks,
      (SELECT COUNT(*) FROM inspection_tasks WHERE flood_season = 1 AND status = '待执行') as flood_pending_tasks,
      (SELECT COUNT(*) FROM inspection_records) as records,
      (SELECT COUNT(*) FROM defect_orders) as total_defects,
      (SELECT COUNT(*) FROM defect_orders WHERE severity = '危急' AND status IN ('待处理','处理中','待复核')) as critical_defects,
      (SELECT COUNT(*) FROM defect_orders WHERE severity = '严重' AND status IN ('待处理','处理中','待复核')) as serious_defects,
      (SELECT COUNT(*) FROM defect_orders WHERE status = '待处理') as pending_defects,
      (SELECT COUNT(*) FROM defect_orders WHERE status = '处理中') as handling_defects,
      (SELECT COUNT(*) FROM defect_orders WHERE status = '已关闭') as closed_defects,
      (SELECT COUNT(*) FROM defect_orders WHERE status IN ('待处理','处理中','待复核') AND deadline < date('now')) as overdue_defects,
      (SELECT COUNT(*) FROM defect_orders WHERE flood_related = 1 AND status IN ('待处理','处理中','待复核')) as flood_defects,
      (SELECT COUNT(*) FROM segments WHERE flood_risk_level = '高') as high_flood_segments,
      (SELECT COUNT(*) FROM segments WHERE flood_risk_level = '中') as medium_flood_segments,
      (SELECT COUNT(*) FROM segments WHERE flood_risk_level = '低') as low_flood_segments
  `,
    )
    .get();

  const lines = db
    .prepare(
      `
    SELECT l.*, 
      (SELECT COUNT(*) FROM towers t WHERE t.line_id = l.id) as tower_count,
      (SELECT COUNT(*) FROM segments s WHERE s.line_id = l.id) as segment_count,
      (SELECT COUNT(*) FROM segments s WHERE s.line_id = l.id AND s.flood_risk_level = '高') as high_flood_segments,
      (SELECT COUNT(*) FROM segments s WHERE s.line_id = l.id AND s.flood_risk_level = '中') as medium_flood_segments
    FROM lines l ORDER BY l.id
  `,
    )
    .all();

  const tasks = db
    .prepare(
      `
    SELECT it.*, s.segment_no, l.name as line_name, s.flood_risk_level
    FROM inspection_tasks it
    LEFT JOIN segments s ON it.segment_id = s.id
    LEFT JOIN lines l ON s.line_id = l.id
    ORDER BY it.planned_date DESC LIMIT 8
  `,
    )
    .all();

  const defects = db
    .prepare(
      `
    SELECT df.*, s.segment_no, l.name as line_name, s.flood_risk_level
    FROM defect_orders df
    LEFT JOIN segments s ON df.segment_id = s.id
    LEFT JOIN lines l ON s.line_id = l.id
    ORDER BY CASE df.severity WHEN '危急' THEN 1 WHEN '严重' THEN 2 ELSE 3 END, df.created_at DESC LIMIT 8
  `,
    )
    .all();

  const severityBadge = (s) => {
    if (s === "危急") return '<span class="badge badge-critical">危急</span>';
    if (s === "严重") return '<span class="badge badge-serious">严重</span>';
    return '<span class="badge badge-normal">一般</span>';
  };

  const statusBadge = (s) => {
    if (s === "待执行")
      return '<span class="badge badge-pending">待执行</span>';
    if (s === "已完成") return '<span class="badge badge-done">已完成</span>';
    if (s === "待处理")
      return '<span class="badge badge-pending">待处理</span>';
    if (s === "处理中") return '<span class="badge badge-doing">处理中</span>';
    if (s === "待复核") return '<span class="badge badge-review">待复核</span>';
    if (s === "已关闭") return '<span class="badge badge-done">已关闭</span>';
    return s;
  };

  const capacityRatio = (line) => {
    if (!line.capacity_mw) return 100;
    return Math.round((line.current_capacity_mw / line.capacity_mw) * 100);
  };

  res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>风电送出线路巡检系统</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #f0f2f5; color: #333; }
    .header { background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; padding: 24px 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .header p { opacity: 0.9; font-size: 14px; }
    .container { max-width: 1400px; margin: 24px auto; padding: 0 24px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .stat-card .label { font-size: 13px; color: #666; margin-bottom: 8px; }
    .stat-card .value { font-size: 28px; font-weight: 600; color: #1e3a8a; }
    .stat-card.critical .value { color: #dc2626; }
    .stat-card.warning .value { color: #ea580c; }
    .section { background: white; border-radius: 8px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .section h2 { font-size: 18px; margin-bottom: 16px; color: #1e3a8a; display: flex; align-items: center; gap: 8px; }
    .section h2::before { content: ''; width: 4px; height: 18px; background: #3b82f6; border-radius: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
    th { background: #f8fafc; color: #475569; font-weight: 500; }
    tr:hover { background: #f8fafc; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .badge-critical { background: #fee2e2; color: #dc2626; }
    .badge-serious { background: #fed7aa; color: #ea580c; }
    .badge-normal { background: #dbeafe; color: #2563eb; }
    .badge-pending { background: #fef3c7; color: #b45309; }
    .badge-doing { background: #dbeafe; color: #2563eb; }
    .badge-review { background: #e0e7ff; color: #4338ca; }
    .badge-done { background: #dcfce7; color: #15803d; }
    .capacity-bar { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-top: 4px; }
    .capacity-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
    .capacity-fill.high { background: #22c55e; }
    .capacity-fill.medium { background: #eab308; }
    .capacity-fill.low { background: #ef4444; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }
    .api-link { color: #3b82f6; text-decoration: none; font-size: 13px; }
    .api-link:hover { text-decoration: underline; }
    .small { font-size: 12px; color: #9ca3af; }
    .flood-banner {
      background: ${isFloodSeason ? "linear-gradient(135deg, #dc2626, #ea580c)" : "linear-gradient(135deg, #16a34a, #22c55e)"};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .flood-banner .icon { font-size: 24px; }
    .flood-banner .title { font-weight: 600; font-size: 15px; }
    .flood-banner .desc { font-size: 13px; opacity: 0.9; }
    .badge-flood-high { background: #fee2e2; color: #dc2626; }
    .badge-flood-medium { background: #fed7aa; color: #ea580c; }
    .badge-flood-low { background: #dcfce7; color: #15803d; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ 风电送出线路巡检系统</h1>
    <p>四十多公里送出线路 · 分段建档 · 周期巡检 · 缺陷工单全流程管理</p>
  </div>
  
  <div class="container">
    <div class="flood-banner">
      <div class="icon">${isFloodSeason ? "🌧️" : "☀️"}</div>
      <div>
        <div class="title">${isFloodSeason ? "当前处于汛期（5-9月）" : "当前处于非汛期"}</div>
        <div class="desc">${isFloodSeason ? "高风险区段巡检频次已自动提升，请密切关注塔基边坡、跨越点和通道树障" : "汛期结束，巡检周期恢复正常"}</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">送出线路</div>
        <div class="value">${summary.lines}</div>
        <div class="small">${summary.towers} 基杆塔 · ${summary.segments} 个区段</div>
      </div>
      <div class="stat-card">
        <div class="label">巡检任务</div>
        <div class="value">${summary.total_tasks}</div>
        <div class="small">待执行 ${summary.pending_tasks} 个</div>
      </div>
      <div class="stat-card">
        <div class="label">巡检记录</div>
        <div class="value">${summary.records}</div>
      </div>
      <div class="stat-card">
        <div class="label">缺陷工单</div>
        <div class="value">${summary.total_defects}</div>
        <div class="small">待处理 ${summary.pending_defects} · 处理中 ${summary.handling_defects}</div>
      </div>
      <div class="stat-card critical">
        <div class="label">危急缺陷</div>
        <div class="value">${summary.critical_defects}</div>
      </div>
      <div class="stat-card warning">
        <div class="label">严重缺陷</div>
        <div class="value">${summary.serious_defects}</div>
      </div>
      <div class="stat-card warning">
        <div class="label">超期未处理</div>
        <div class="value">${summary.overdue_defects}</div>
      </div>
      <div class="stat-card">
        <div class="label">已消缺</div>
        <div class="value">${summary.closed_defects}</div>
      </div>
      <div class="stat-card critical">
        <div class="label">高汛期风险区段</div>
        <div class="value">${summary.high_flood_segments}</div>
        <div class="small">中风险 ${summary.medium_flood_segments} 个</div>
      </div>
      <div class="stat-card warning">
        <div class="label">汛期相关缺陷</div>
        <div class="value">${summary.flood_defects}</div>
        <div class="small">待处理/处理中</div>
      </div>
      <div class="stat-card">
        <div class="label">汛期待检任务</div>
        <div class="value">${summary.flood_pending_tasks}</div>
        <div class="small">已加密频次</div>
      </div>
    </div>

    <div class="section">
      <h2>📋 线路概况</h2>
      <table>
        <thead>
          <tr>
            <th>线路名称</th>
            <th>电压等级</th>
            <th>全长</th>
            <th>杆塔数</th>
            <th>区段数</th>
            <th>汛期风险</th>
            <th>额定容量</th>
            <th>当前容量</th>
            <th>容量比</th>
          </tr>
        </thead>
        <tbody>
          ${lines
            .map((l) => {
              const ratio = capacityRatio(l);
              const fillClass =
                ratio >= 80 ? "high" : ratio >= 50 ? "medium" : "low";
              const floodBadges = [];
              if (l.high_flood_segments > 0)
                floodBadges.push(
                  `<span class="badge badge-flood-high">高 ${l.high_flood_segments}</span>`,
                );
              if (l.medium_flood_segments > 0)
                floodBadges.push(
                  `<span class="badge badge-flood-medium">中 ${l.medium_flood_segments}</span>`,
                );
              if (floodBadges.length === 0)
                floodBadges.push(
                  `<span class="badge badge-flood-low">低</span>`,
                );
              return `
            <tr>
              <td><strong>${l.name}</strong></td>
              <td>${l.voltage}</td>
              <td>${l.length_km} km</td>
              <td>${l.tower_count}</td>
              <td>${l.segment_count}</td>
              <td>${floodBadges.join(" ")}</td>
              <td>${l.capacity_mw} MW</td>
              <td>${l.current_capacity_mw} MW</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span>${ratio}%</span>
                  <div style="flex:1;min-width:100px;">
                    <div class="capacity-bar"><div class="capacity-fill ${fillClass}" style="width:${ratio}%"></div></div>
                  </div>
                </div>
              </td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="grid-2">
      <div class="section">
        <h2>🔧 近期巡检任务</h2>
        <table>
          <thead>
            <tr>
              <th>所属线路</th>
              <th>区段</th>
              <th>类型</th>
              <th>计划日期</th>
              <th>巡检员</th>
              <th>汛期</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            ${tasks
              .map(
                (t) => `
            <tr>
              <td>${t.line_name || "-"}</td>
              <td>${t.segment_no || "-"}</td>
              <td>${t.task_type}</td>
              <td>${t.planned_date}</td>
              <td>${t.inspector || "-"}</td>
              <td>${t.flood_season ? '<span class="badge badge-flood-high">汛期</span>' : '<span class="badge badge-flood-low">非汛期</span>'}</td>
              <td>${statusBadge(t.status)}</td>
            </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>

      <div class="section">
        <h2>⚠️ 缺陷工单</h2>
        <table>
          <thead>
            <tr>
              <th>严重度</th>
              <th>缺陷类型</th>
              <th>所属区段</th>
              <th>汛期相关</th>
              <th>截止日期</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            ${defects
              .map(
                (d) => `
            <tr>
              <td>${severityBadge(d.severity)}</td>
              <td title="${d.description}">${d.defect_type}</td>
              <td>${d.segment_no ? d.segment_no + " (" + d.line_name + ")" : "-"}</td>
              <td>${d.flood_related ? '<span class="badge badge-flood-medium">汛期</span>' : '<span class="badge badge-flood-low">否</span>'}</td>
              <td>${d.deadline || "-"}</td>
              <td>${statusBadge(d.status)}</td>
            </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <h2>📊 统计分析接口</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
        <a href="/api/stats/summary" class="api-link">📈 /api/stats/summary - 系统总体概况</a>
        <a href="/api/stats/defect-density" class="api-link">📍 /api/stats/defect-density - 各区段缺陷密度</a>
        <a href="/api/stats/repair-duration" class="api-link">⏱️ /api/stats/repair-duration - 平均消缺时长</a>
        <a href="/api/stats/overdue" class="api-link">⚠️ /api/stats/overdue - 超期未处理统计</a>
        <a href="/api/stats/availability" class="api-link">🔋 /api/stats/availability - 线路可用率与容量</a>
        <a href="/api/stats/flood-risk" class="api-link">🌧️ /api/stats/flood-risk - 汛期通道风险详情</a>
        <a href="/api" class="api-link">🔗 查看完整 API 索引</a>
      </div>
    </div>
  </div>
</body>
</html>
  `);
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

function checkDatabaseReady() {
  try {
    const lineCount = db.prepare("SELECT COUNT(*) as c FROM lines").get().c;
    return lineCount > 0;
  } catch (e) {
    return false;
  }
}

app.listen(PORT, () => {
  console.log("=".repeat(60));
  console.log("  风电送出线路巡检后端系统 已启动");
  console.log(`  服务地址: http://localhost:${PORT}`);
  console.log("=".repeat(60));

  const dbPath = path.join(__dirname, "..", "data", "inspection.db");
  if (!checkDatabaseReady()) {
    console.log("\n  检测到数据库为空，正在写入种子数据...");
    try {
      const { seedIfNeeded } = require("./seed");
      seedIfNeeded();
      console.log("  种子数据写入完成！");
    } catch (e) {
      console.error("  种子数据写入失败:", e.message);
    }
  } else {
    console.log("\n  数据库已就绪，跳过种子数据初始化");
  }
  console.log(`\n  数据库文件: ${dbPath}`);
  console.log("  每日 6:00 自动生成巡检任务");
  console.log("=".repeat(60));
});
