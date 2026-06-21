const express = require("express");
const db = require("../db");
const router = express.Router();

function recalcCapacity(segmentId) {
  const segment = db
    .prepare("SELECT * FROM segments WHERE id = ?")
    .get(segmentId);
  if (!segment) return;

  const criticalActive = db
    .prepare(
      `
    SELECT COUNT(*) as c FROM defect_orders
    WHERE segment_id = ? AND severity = '危急' AND status IN ('待处理', '处理中')
  `,
    )
    .get(segmentId).c;

  const seriousActive = db
    .prepare(
      `
    SELECT COUNT(*) as c FROM defect_orders
    WHERE segment_id = ? AND severity = '严重' AND status IN ('待处理', '处理中')
  `,
    )
    .get(segmentId).c;

  let newCapacity = segment.max_capacity_mw;
  if (criticalActive > 0) {
    newCapacity = segment.max_capacity_mw * 0.5;
  } else if (seriousActive > 0) {
    newCapacity = segment.max_capacity_mw * 0.8;
  }

  db.prepare("UPDATE segments SET current_capacity_mw = ? WHERE id = ?").run(
    newCapacity,
    segmentId,
  );
  db.prepare(
    `UPDATE defect_orders SET capacity_restricted = 1 
     WHERE segment_id = ? AND severity IN ('危急', '严重') AND status IN ('待处理', '处理中')`,
  ).run(segmentId);
  db.prepare(
    `UPDATE defect_orders SET capacity_restricted = 0 
     WHERE segment_id = ? AND (severity NOT IN ('危急', '严重') OR status NOT IN ('待处理', '处理中'))`,
  ).run(segmentId);

  const line = db
    .prepare("SELECT line_id FROM segments WHERE id = ?")
    .get(segmentId);
  if (line) {
    const segments = db
      .prepare(
        "SELECT current_capacity_mw, max_capacity_mw FROM segments WHERE line_id = ?",
      )
      .all(line.line_id);
    const lineInfo = db
      .prepare("SELECT capacity_mw FROM lines WHERE id = ?")
      .get(line.line_id);
    if (segments.length > 0) {
      const minCap = Math.min(...segments.map((s) => s.current_capacity_mw));
      db.prepare("UPDATE lines SET current_capacity_mw = ? WHERE id = ?").run(
        minCap,
        line.line_id,
      );
    }
  }
}

router.get("/", (req, res) => {
  const { segment_id, severity, status, assignee } = req.query;
  let sql = `
    SELECT do.*,
      s.segment_no,
      l.name as line_name
    FROM defect_orders do
    LEFT JOIN segments s ON do.segment_id = s.id
    LEFT JOIN lines l ON s.line_id = l.id
  `;
  const params = [];
  const conds = [];
  if (segment_id) {
    conds.push("do.segment_id = ?");
    params.push(segment_id);
  }
  if (severity) {
    conds.push("do.severity = ?");
    params.push(severity);
  }
  if (status) {
    conds.push("do.status = ?");
    params.push(status);
  }
  if (assignee) {
    conds.push("do.assignee = ?");
    params.push(assignee);
  }
  if (conds.length) sql += " WHERE " + conds.join(" AND ");
  sql += ` ORDER BY CASE do.severity WHEN '危急' THEN 1 WHEN '严重' THEN 2 WHEN '一般' THEN 3 ELSE 4 END, do.created_at DESC`;
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const order = db
    .prepare(
      `
    SELECT do.*, s.segment_no, l.name as line_name
    FROM defect_orders do
    LEFT JOIN segments s ON do.segment_id = s.id
    LEFT JOIN lines l ON s.line_id = l.id
    WHERE do.id = ?
  `,
    )
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "缺陷工单不存在" });
  res.json(order);
});

router.post("/", (req, res) => {
  const {
    record_id,
    segment_id,
    defect_type,
    description,
    severity,
    assignee,
    deadline,
  } = req.body;
  if (!segment_id || !defect_type || !description || !severity) {
    return res.status(400).json({ error: "缺少必填字段" });
  }
  const deadlineDays = severity === "危急" ? 1 : severity === "严重" ? 7 : 30;
  const deadlineDate =
    deadline ||
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + deadlineDays);
      return d.toISOString().split("T")[0];
    })();

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `
      INSERT INTO defect_orders (record_id, segment_id, defect_type, description, severity, assignee, deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        record_id,
        segment_id,
        defect_type,
        description,
        severity,
        assignee,
        deadlineDate,
      );

    if (severity === "危急" || severity === "严重") {
      recalcCapacity(segment_id);
    }
    return info.lastInsertRowid;
  });

  try {
    const id = tx();
    const order = db
      .prepare("SELECT * FROM defect_orders WHERE id = ?")
      .get(id);
    res.status(201).json(order);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/:id/assign", (req, res) => {
  const order = db
    .prepare("SELECT * FROM defect_orders WHERE id = ?")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "缺陷工单不存在" });
  const { assignee } = req.body;
  if (!assignee) return res.status(400).json({ error: "缺少处理人" });
  db.prepare(
    "UPDATE defect_orders SET assignee = ?, status = ? WHERE id = ?",
  ).run(assignee, "处理中", req.params.id);
  const updated = db
    .prepare("SELECT * FROM defect_orders WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

router.put("/:id/handle", (req, res) => {
  const order = db
    .prepare("SELECT * FROM defect_orders WHERE id = ?")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "缺陷工单不存在" });
  const { handler, handle_notes } = req.body;
  if (!handler) return res.status(400).json({ error: "缺少处理人" });
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE defect_orders SET handler = ?, handled_at = ?, handle_notes = ?, status = '待复核' WHERE id = ?`,
  ).run(handler, now, handle_notes, req.params.id);
  const updated = db
    .prepare("SELECT * FROM defect_orders WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

router.put("/:id/review", (req, res) => {
  const order = db
    .prepare("SELECT * FROM defect_orders WHERE id = ?")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "缺陷工单不存在" });
  const { reviewer, review_notes, pass = true } = req.body;
  if (!reviewer) return res.status(400).json({ error: "缺少复核人" });
  if (!pass) {
    db.prepare(
      `UPDATE defect_orders SET reviewer = ?, review_notes = ?, status = '处理中' WHERE id = ?`,
    ).run(reviewer, review_notes || "复核不通过，需重新处理", req.params.id);
    const updated = db
      .prepare("SELECT * FROM defect_orders WHERE id = ?")
      .get(req.params.id);
    return res.json(updated);
  }

  const tx = db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE defect_orders SET reviewer = ?, reviewed_at = ?, review_notes = ?, status = '已关闭' WHERE id = ?`,
    ).run(reviewer, now, review_notes, req.params.id);
    recalcCapacity(order.segment_id);
  });

  try {
    tx();
    const updated = db
      .prepare("SELECT * FROM defect_orders WHERE id = ?")
      .get(req.params.id);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/:id", (req, res) => {
  const order = db
    .prepare("SELECT * FROM defect_orders WHERE id = ?")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "缺陷工单不存在" });
  const { defect_type, description, severity, deadline, assignee } = req.body;
  db.prepare(
    `
    UPDATE defect_orders SET
      defect_type = COALESCE(?, defect_type),
      description = COALESCE(?, description),
      severity = COALESCE(?, severity),
      deadline = COALESCE(?, deadline),
      assignee = COALESCE(?, assignee)
    WHERE id = ?
  `,
  ).run(defect_type, description, severity, deadline, assignee, req.params.id);

  if (
    (severity === "危急" || severity === "严重") &&
    order.severity !== severity
  ) {
    recalcCapacity(order.segment_id);
  } else if (
    (order.severity === "危急" || order.severity === "严重") &&
    severity &&
    severity !== order.severity
  ) {
    recalcCapacity(order.segment_id);
  }

  const updated = db
    .prepare("SELECT * FROM defect_orders WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

router.delete("/:id", (req, res) => {
  const order = db
    .prepare("SELECT * FROM defect_orders WHERE id = ?")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "缺陷工单不存在" });
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM defect_orders WHERE id = ?").run(req.params.id);
    recalcCapacity(order.segment_id);
  });
  tx();
  res.json({ message: "已删除" });
});

module.exports = { router, recalcCapacity };
