const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", (req, res) => {
  const { segment_id } = req.query;
  let sql = "SELECT * FROM crossing_points";
  const params = [];
  if (segment_id) {
    sql += " WHERE segment_id = ?";
    params.push(segment_id);
  }
  sql += " ORDER BY id";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

router.post("/", (req, res) => {
  const {
    segment_id,
    crossing_type,
    description,
    distance_from_start,
    protection_level,
    flood_risk_level,
  } = req.body;
  if (!segment_id || !crossing_type) {
    return res.status(400).json({ error: "缺少必填字段" });
  }
  const info = db
    .prepare(
      `
    INSERT INTO crossing_points (segment_id, crossing_type, description, distance_from_start, protection_level, flood_risk_level)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      segment_id,
      crossing_type,
      description,
      distance_from_start,
      protection_level,
      flood_risk_level || "低",
    );
  const cp = db
    .prepare("SELECT * FROM crossing_points WHERE id = ?")
    .get(info.lastInsertRowid);
  res.status(201).json(cp);
});

router.put("/:id", (req, res) => {
  const cp = db
    .prepare("SELECT * FROM crossing_points WHERE id = ?")
    .get(req.params.id);
  if (!cp) return res.status(404).json({ error: "跨越点不存在" });
  const {
    crossing_type,
    description,
    distance_from_start,
    protection_level,
    flood_risk_level,
  } = req.body;
  db.prepare(
    `
    UPDATE crossing_points SET
      crossing_type = COALESCE(?, crossing_type),
      description = COALESCE(?, description),
      distance_from_start = COALESCE(?, distance_from_start),
      protection_level = COALESCE(?, protection_level),
      flood_risk_level = COALESCE(?, flood_risk_level)
    WHERE id = ?
  `,
  ).run(
    crossing_type,
    description,
    distance_from_start,
    protection_level,
    flood_risk_level,
    req.params.id,
  );
  const updated = db
    .prepare("SELECT * FROM crossing_points WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

router.delete("/:id", (req, res) => {
  const info = db
    .prepare("DELETE FROM crossing_points WHERE id = ?")
    .run(req.params.id);
  if (info.changes === 0)
    return res.status(404).json({ error: "跨越点不存在" });
  res.json({ message: "已删除" });
});

module.exports = router;
