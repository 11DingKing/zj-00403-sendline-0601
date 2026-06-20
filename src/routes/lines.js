const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM lines ORDER BY id").all();
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const line = db
    .prepare("SELECT * FROM lines WHERE id = ?")
    .get(req.params.id);
  if (!line) return res.status(404).json({ error: "线路不存在" });

  const towers = db
    .prepare("SELECT * FROM towers WHERE line_id = ? ORDER BY tower_no")
    .all(req.params.id);
  const segments = db
    .prepare(
      `
    SELECT s.*,
      t1.tower_no as start_tower_no,
      t2.tower_no as end_tower_no
    FROM segments s
    LEFT JOIN towers t1 ON s.start_tower_id = t1.id
    LEFT JOIN towers t2 ON s.end_tower_id = t2.id
    WHERE s.line_id = ?
    ORDER BY s.segment_no
  `,
    )
    .all(req.params.id);

  res.json({ ...line, towers, segments });
});

router.post("/", (req, res) => {
  const {
    name,
    voltage,
    length_km,
    start_point,
    end_point,
    capacity_mw,
    status = "正常",
  } = req.body;
  if (
    !name ||
    !voltage ||
    !length_km ||
    !start_point ||
    !end_point ||
    !capacity_mw
  ) {
    return res.status(400).json({ error: "缺少必填字段" });
  }
  const info = db
    .prepare(
      `
    INSERT INTO lines (name, voltage, length_km, start_point, end_point, capacity_mw, current_capacity_mw, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      name,
      voltage,
      length_km,
      start_point,
      end_point,
      capacity_mw,
      capacity_mw,
      status,
    );

  const line = db
    .prepare("SELECT * FROM lines WHERE id = ?")
    .get(info.lastInsertRowid);
  res.status(201).json(line);
});

router.put("/:id", (req, res) => {
  const line = db
    .prepare("SELECT * FROM lines WHERE id = ?")
    .get(req.params.id);
  if (!line) return res.status(404).json({ error: "线路不存在" });

  const {
    name,
    voltage,
    length_km,
    start_point,
    end_point,
    capacity_mw,
    current_capacity_mw,
    status,
  } = req.body;
  db.prepare(
    `
    UPDATE lines SET
      name = COALESCE(?, name),
      voltage = COALESCE(?, voltage),
      length_km = COALESCE(?, length_km),
      start_point = COALESCE(?, start_point),
      end_point = COALESCE(?, end_point),
      capacity_mw = COALESCE(?, capacity_mw),
      current_capacity_mw = COALESCE(?, current_capacity_mw),
      status = COALESCE(?, status)
    WHERE id = ?
  `,
  ).run(
    name,
    voltage,
    length_km,
    start_point,
    end_point,
    capacity_mw,
    current_capacity_mw,
    status,
    req.params.id,
  );

  const updated = db
    .prepare("SELECT * FROM lines WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

router.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM lines WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "线路不存在" });
  res.json({ message: "已删除" });
});

module.exports = router;
