const express = require("express");
const db = require("../db");
const router = express.Router();

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function generateTasks() {
  const segments = db.prepare("SELECT id, icing_risk FROM segments").all();
  const today = new Date().toISOString().split("T")[0];

  segments.forEach((seg) => {
    let cycle_days = 30;
    if (seg.icing_risk === "高") cycle_days = 15;
    else if (seg.icing_risk === "中") cycle_days = 20;

    const lastTask = db
      .prepare(
        `
      SELECT * FROM inspection_tasks
      WHERE segment_id = ? AND task_type = '定期巡检'
      ORDER BY planned_date DESC LIMIT 1
    `,
      )
      .get(seg.id);

    let nextDate;
    if (!lastTask) {
      nextDate = today;
    } else {
      nextDate = addDays(lastTask.planned_date, cycle_days);
      if (nextDate < today) nextDate = today;
    }

    const existing = db
      .prepare(
        `
      SELECT * FROM inspection_tasks
      WHERE segment_id = ? AND planned_date = ? AND status = '待执行'
    `,
      )
      .get(seg.id, nextDate);

    if (!existing) {
      db.prepare(
        `
        INSERT INTO inspection_tasks (segment_id, task_type, cycle_days, planned_date, status)
        VALUES (?, '定期巡检', ?, ?, '待执行')
      `,
      ).run(seg.id, cycle_days, nextDate);
    }
  });
}

router.get("/", (req, res) => {
  const { segment_id, status } = req.query;
  let sql = `
    SELECT it.*,
      s.segment_no,
      l.name as line_name
    FROM inspection_tasks it
    LEFT JOIN segments s ON it.segment_id = s.id
    LEFT JOIN lines l ON s.line_id = l.id
  `;
  const params = [];
  const conds = [];
  if (segment_id) {
    conds.push("it.segment_id = ?");
    params.push(segment_id);
  }
  if (status) {
    conds.push("it.status = ?");
    params.push(status);
  }
  if (conds.length) sql += " WHERE " + conds.join(" AND ");
  sql += " ORDER BY it.planned_date DESC";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const task = db
    .prepare(
      `
    SELECT it.*, s.segment_no, l.name as line_name
    FROM inspection_tasks it
    LEFT JOIN segments s ON it.segment_id = s.id
    LEFT JOIN lines l ON s.line_id = l.id
    WHERE it.id = ?
  `,
    )
    .get(req.params.id);
  if (!task) return res.status(404).json({ error: "巡检任务不存在" });
  const records = db
    .prepare(
      `
    SELECT ir.*, t.tower_no
    FROM inspection_records ir
    LEFT JOIN towers t ON ir.tower_id = t.id
    WHERE ir.task_id = ?
  `,
    )
    .all(req.params.id);
  res.json({ ...task, records });
});

router.post("/generate", (req, res) => {
  const before = db
    .prepare("SELECT COUNT(*) as c FROM inspection_tasks WHERE status = ?")
    .get("待执行").c;
  generateTasks();
  const after = db
    .prepare("SELECT COUNT(*) as c FROM inspection_tasks WHERE status = ?")
    .get("待执行").c;
  res.json({ message: "巡检任务已生成", new_tasks: after - before });
});

router.post("/", (req, res) => {
  const {
    segment_id,
    task_type = "临时巡检",
    cycle_days = 0,
    planned_date,
    inspector,
  } = req.body;
  if (!segment_id || !planned_date) {
    return res.status(400).json({ error: "缺少必填字段" });
  }
  const info = db
    .prepare(
      `
    INSERT INTO inspection_tasks (segment_id, task_type, cycle_days, planned_date, inspector, status)
    VALUES (?, ?, ?, ?, ?, '待执行')
  `,
    )
    .run(segment_id, task_type, cycle_days, planned_date, inspector);
  const task = db
    .prepare("SELECT * FROM inspection_tasks WHERE id = ?")
    .get(info.lastInsertRowid);
  res.status(201).json(task);
});

router.put("/:id", (req, res) => {
  const task = db
    .prepare("SELECT * FROM inspection_tasks WHERE id = ?")
    .get(req.params.id);
  if (!task) return res.status(404).json({ error: "巡检任务不存在" });
  const { status, inspector, actual_date } = req.body;
  db.prepare(
    `
    UPDATE inspection_tasks SET
      status = COALESCE(?, status),
      inspector = COALESCE(?, inspector),
      actual_date = COALESCE(?, actual_date)
    WHERE id = ?
  `,
  ).run(status, inspector, actual_date, req.params.id);
  const updated = db
    .prepare("SELECT * FROM inspection_tasks WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

module.exports = { router, generateTasks };
