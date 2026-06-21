const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", (req, res) => {
  const { line_id } = req.query;
  let sql = `
    SELECT s.*,
      t1.tower_no as start_tower_no,
      t2.tower_no as end_tower_no,
      l.name as line_name
    FROM segments s
    LEFT JOIN towers t1 ON s.start_tower_id = t1.id
    LEFT JOIN towers t2 ON s.end_tower_id = t2.id
    LEFT JOIN lines l ON s.line_id = l.id
  `;
  const params = [];
  if (line_id) {
    sql += " WHERE s.line_id = ?";
    params.push(line_id);
  }
  sql += " ORDER BY s.line_id, s.segment_no";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const segment = db
    .prepare(
      `
    SELECT s.*,
      t1.tower_no as start_tower_no,
      t2.tower_no as end_tower_no,
      l.name as line_name
    FROM segments s
    LEFT JOIN towers t1 ON s.start_tower_id = t1.id
    LEFT JOIN towers t2 ON s.end_tower_id = t2.id
    LEFT JOIN lines l ON s.line_id = l.id
    WHERE s.id = ?
  `,
    )
    .get(req.params.id);
  if (!segment) return res.status(404).json({ error: "区段不存在" });

  const crossings = db
    .prepare("SELECT * FROM crossing_points WHERE segment_id = ?")
    .all(req.params.id);
  const hazards = db
    .prepare("SELECT * FROM hazard_points WHERE segment_id = ?")
    .all(req.params.id);
  res.json({ ...segment, crossings, hazards });
});

function recalcSegmentFloodRisk(segmentId) {
  const segment = db
    .prepare("SELECT * FROM segments WHERE id = ?")
    .get(segmentId);
  if (!segment) return;

  const towers = db
    .prepare("SELECT slope_flood_risk FROM towers WHERE id IN (?, ?)")
    .all(segment.start_tower_id, segment.end_tower_id);

  const crossings = db
    .prepare(
      "SELECT flood_risk_level FROM crossing_points WHERE segment_id = ?",
    )
    .all(segmentId);

  const hazards = db
    .prepare("SELECT flood_risk_level FROM hazard_points WHERE segment_id = ?")
    .all(segmentId);

  const riskMap = { 低: 1, 中: 2, 高: 3 };
  let maxRisk = 1;

  towers.forEach((t) => {
    if (t.slope_flood_risk && riskMap[t.slope_flood_risk] > maxRisk) {
      maxRisk = riskMap[t.slope_flood_risk];
    }
  });
  crossings.forEach((c) => {
    if (c.flood_risk_level && riskMap[c.flood_risk_level] > maxRisk) {
      maxRisk = riskMap[c.flood_risk_level];
    }
  });
  hazards.forEach((h) => {
    if (h.flood_risk_level && riskMap[h.flood_risk_level] > maxRisk) {
      maxRisk = riskMap[h.flood_risk_level];
    }
  });

  const riskLevel =
    Object.keys(riskMap).find((k) => riskMap[k] === maxRisk) || "低";
  db.prepare("UPDATE segments SET flood_risk_level = ? WHERE id = ?").run(
    riskLevel,
    segmentId,
  );
}

router.post("/", (req, res) => {
  const {
    line_id,
    segment_no,
    start_tower_id,
    end_tower_id,
    length_km,
    altitude_avg,
    road_accessibility,
    icing_risk,
    flood_risk_level,
    responsible_team,
    max_capacity_mw,
  } = req.body;
  if (
    !line_id ||
    !segment_no ||
    !start_tower_id ||
    !end_tower_id ||
    length_km == null ||
    !road_accessibility ||
    !icing_risk ||
    !responsible_team
  ) {
    return res.status(400).json({ error: "缺少必填字段" });
  }
  const info = db
    .prepare(
      `
    INSERT INTO segments (line_id, segment_no, start_tower_id, end_tower_id, length_km, altitude_avg, road_accessibility, icing_risk, flood_risk_level, responsible_team, max_capacity_mw, current_capacity_mw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      line_id,
      segment_no,
      start_tower_id,
      end_tower_id,
      length_km,
      altitude_avg,
      road_accessibility,
      icing_risk,
      flood_risk_level || "低",
      responsible_team,
      max_capacity_mw,
      max_capacity_mw,
    );

  const segment = db
    .prepare("SELECT * FROM segments WHERE id = ?")
    .get(info.lastInsertRowid);
  res.status(201).json(segment);
});

router.put("/:id", (req, res) => {
  const segment = db
    .prepare("SELECT * FROM segments WHERE id = ?")
    .get(req.params.id);
  if (!segment) return res.status(404).json({ error: "区段不存在" });

  const {
    line_id,
    segment_no,
    start_tower_id,
    end_tower_id,
    length_km,
    altitude_avg,
    road_accessibility,
    icing_risk,
    flood_risk_level,
    responsible_team,
    max_capacity_mw,
    current_capacity_mw,
  } = req.body;
  db.prepare(
    `
    UPDATE segments SET
      line_id = COALESCE(?, line_id),
      segment_no = COALESCE(?, segment_no),
      start_tower_id = COALESCE(?, start_tower_id),
      end_tower_id = COALESCE(?, end_tower_id),
      length_km = COALESCE(?, length_km),
      altitude_avg = COALESCE(?, altitude_avg),
      road_accessibility = COALESCE(?, road_accessibility),
      icing_risk = COALESCE(?, icing_risk),
      flood_risk_level = COALESCE(?, flood_risk_level),
      responsible_team = COALESCE(?, responsible_team),
      max_capacity_mw = COALESCE(?, max_capacity_mw),
      current_capacity_mw = COALESCE(?, current_capacity_mw)
    WHERE id = ?
  `,
  ).run(
    line_id,
    segment_no,
    start_tower_id,
    end_tower_id,
    length_km,
    altitude_avg,
    road_accessibility,
    icing_risk,
    flood_risk_level,
    responsible_team,
    max_capacity_mw,
    current_capacity_mw,
    req.params.id,
  );

  const updated = db
    .prepare("SELECT * FROM segments WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

router.post("/:id/recalc-flood-risk", (req, res) => {
  const segment = db
    .prepare("SELECT * FROM segments WHERE id = ?")
    .get(req.params.id);
  if (!segment) return res.status(404).json({ error: "区段不存在" });
  recalcSegmentFloodRisk(req.params.id);
  const updated = db
    .prepare("SELECT * FROM segments WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

router.delete("/:id", (req, res) => {
  const info = db
    .prepare("DELETE FROM segments WHERE id = ?")
    .run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "区段不存在" });
  res.json({ message: "已删除" });
});

module.exports = { router, recalcSegmentFloodRisk };
