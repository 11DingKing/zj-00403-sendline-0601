const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", (req, res) => {
  const { segment_id } = req.query;
  let sql = "SELECT * FROM hazard_points";
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
    hazard_type,
    description,
    risk_level,
    flood_risk_level,
    distance_from_start,
    mitigation_measures,
  } = req.body;
  if (!segment_id || !hazard_type || !description || !risk_level) {
    return res.status(400).json({ error: "缺少必填字段" });
  }
  const info = db
    .prepare(
      `
    INSERT INTO hazard_points (segment_id, hazard_type, description, risk_level, flood_risk_level, distance_from_start, mitigation_measures)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      segment_id,
      hazard_type,
      description,
      risk_level,
      flood_risk_level || "低",
      distance_from_start,
      mitigation_measures,
    );
  const hp = db
    .prepare("SELECT * FROM hazard_points WHERE id = ?")
    .get(info.lastInsertRowid);
  res.status(201).json(hp);
});

router.put("/:id", (req, res) => {
  const hp = db
    .prepare("SELECT * FROM hazard_points WHERE id = ?")
    .get(req.params.id);
  if (!hp) return res.status(404).json({ error: "隐患点不存在" });
  const {
    hazard_type,
    description,
    risk_level,
    flood_risk_level,
    distance_from_start,
    mitigation_measures,
  } = req.body;
  db.prepare(
    `
    UPDATE hazard_points SET
      hazard_type = COALESCE(?, hazard_type),
      description = COALESCE(?, description),
      risk_level = COALESCE(?, risk_level),
      flood_risk_level = COALESCE(?, flood_risk_level),
      distance_from_start = COALESCE(?, distance_from_start),
      mitigation_measures = COALESCE(?, mitigation_measures)
    WHERE id = ?
  `,
  ).run(
    hazard_type,
    description,
    risk_level,
    flood_risk_level,
    distance_from_start,
    mitigation_measures,
    req.params.id,
  );
  const updated = db
    .prepare("SELECT * FROM hazard_points WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

router.delete("/:id", (req, res) => {
  const info = db
    .prepare("DELETE FROM hazard_points WHERE id = ?")
    .run(req.params.id);
  if (info.changes === 0)
    return res.status(404).json({ error: "隐患点不存在" });
  res.json({ message: "已删除" });
});

module.exports = router;
