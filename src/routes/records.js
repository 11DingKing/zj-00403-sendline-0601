const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", (req, res) => {
  const { task_id, tower_id, inspector } = req.query;
  let sql = `
    SELECT ir.*, t.tower_no, it.planned_date, s.segment_no, l.name as line_name
    FROM inspection_records ir
    LEFT JOIN towers t ON ir.tower_id = t.id
    LEFT JOIN inspection_tasks it ON ir.task_id = it.id
    LEFT JOIN segments s ON it.segment_id = s.id
    LEFT JOIN lines l ON s.line_id = l.id
  `;
  const params = [];
  const conds = [];
  if (task_id) {
    conds.push("ir.task_id = ?");
    params.push(task_id);
  }
  if (tower_id) {
    conds.push("ir.tower_id = ?");
    params.push(tower_id);
  }
  if (inspector) {
    conds.push("ir.inspector = ?");
    params.push(inspector);
  }
  if (conds.length) sql += " WHERE " + conds.join(" AND ");
  sql += " ORDER BY ir.inspection_date DESC";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const record = db
    .prepare(
      `
    SELECT ir.*, t.tower_no, s.segment_no, l.name as line_name
    FROM inspection_records ir
    LEFT JOIN towers t ON ir.tower_id = t.id
    LEFT JOIN inspection_tasks it ON ir.task_id = it.id
    LEFT JOIN segments s ON it.segment_id = s.id
    LEFT JOIN lines l ON s.line_id = l.id
    WHERE ir.id = ?
  `,
    )
    .get(req.params.id);
  if (!record) return res.status(404).json({ error: "巡检记录不存在" });
  res.json(record);
});

router.post("/", (req, res) => {
  const {
    task_id,
    tower_id,
    inspector,
    inspection_date,
    weather,
    insulator_status,
    insulator_notes,
    fitting_status,
    fitting_notes,
    conductor_sag,
    conductor_sag_status,
    conductor_notes,
    tower_slope_status,
    tower_slope_notes,
    channel_tree_status,
    channel_tree_notes,
    overall_status,
    notes,
  } = req.body;

  if (!task_id || !inspector || !inspection_date) {
    return res.status(400).json({ error: "缺少必填字段" });
  }

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `
      INSERT INTO inspection_records (
        task_id, tower_id, inspector, inspection_date, weather,
        insulator_status, insulator_notes,
        fitting_status, fitting_notes,
        conductor_sag, conductor_sag_status, conductor_notes,
        tower_slope_status, tower_slope_notes,
        channel_tree_status, channel_tree_notes,
        overall_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        task_id,
        tower_id,
        inspector,
        inspection_date,
        weather,
        insulator_status,
        insulator_notes,
        fitting_status,
        fitting_notes,
        conductor_sag,
        conductor_sag_status,
        conductor_notes,
        tower_slope_status,
        tower_slope_notes,
        channel_tree_status,
        channel_tree_notes,
        overall_status || "正常",
        notes,
      );

    const defectTypes = [];
    if (insulator_status && insulator_status !== "正常") {
      defectTypes.push({
        type: "绝缘子缺陷",
        desc: insulator_notes || `绝缘子状态: ${insulator_status}`,
        severity:
          insulator_status === "危急"
            ? "危急"
            : insulator_status === "异常"
              ? "严重"
              : "一般",
      });
    }
    if (fitting_status && fitting_status !== "正常") {
      defectTypes.push({
        type: "金具缺陷",
        desc: fitting_notes || `金具状态: ${fitting_status}`,
        severity:
          fitting_status === "危急"
            ? "危急"
            : fitting_status === "异常"
              ? "严重"
              : "一般",
      });
    }
    if (conductor_sag_status && conductor_sag_status !== "正常") {
      defectTypes.push({
        type: "导线弧垂异常",
        desc:
          conductor_notes ||
          `弧垂值: ${conductor_sag}m, 状态: ${conductor_sag_status}`,
        severity:
          conductor_sag_status === "危急"
            ? "危急"
            : conductor_sag_status === "异常"
              ? "严重"
              : "一般",
      });
    }
    if (tower_slope_status && tower_slope_status !== "正常") {
      defectTypes.push({
        type: "塔基边坡异常",
        desc: tower_slope_notes || `塔基边坡状态: ${tower_slope_status}`,
        severity:
          tower_slope_status === "危急"
            ? "危急"
            : tower_slope_status === "异常"
              ? "严重"
              : "一般",
      });
    }
    if (channel_tree_status && channel_tree_status !== "正常") {
      defectTypes.push({
        type: "通道树障",
        desc: channel_tree_notes || `通道树障状态: ${channel_tree_status}`,
        severity:
          channel_tree_status === "危急"
            ? "危急"
            : channel_tree_status === "异常"
              ? "严重"
              : "一般",
      });
    }

    const task = db
      .prepare("SELECT segment_id FROM inspection_tasks WHERE id = ?")
      .get(task_id);
    if (task) {
      defectTypes.forEach((d) => {
        const deadlineDays =
          d.severity === "危急" ? 1 : d.severity === "严重" ? 7 : 30;
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + deadlineDays);
        db.prepare(
          `
          INSERT INTO defect_orders (record_id, segment_id, defect_type, description, severity, status, deadline)
          VALUES (?, ?, ?, ?, ?, '待处理', ?)
        `,
        ).run(
          info.lastInsertRowid,
          task.segment_id,
          d.type,
          d.desc,
          d.severity,
          deadline.toISOString().split("T")[0],
        );
      });
    }

    return info.lastInsertRowid;
  });

  try {
    const id = tx();
    const record = db
      .prepare("SELECT * FROM inspection_records WHERE id = ?")
      .get(id);
    res.status(201).json(record);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
