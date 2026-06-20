const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", (req, res) => {
  const { line_id } = req.query;
  let sql = "SELECT * FROM towers";
  const params = [];
  if (line_id) {
    sql += " WHERE line_id = ?";
    params.push(line_id);
  }
  sql += " ORDER BY line_id, tower_no";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const tower = db
    .prepare("SELECT * FROM towers WHERE id = ?")
    .get(req.params.id);
  if (!tower) return res.status(404).json({ error: "杆塔不存在" });
  res.json(tower);
});

router.post("/", (req, res) => {
  const {
    line_id,
    tower_no,
    type,
    altitude,
    latitude,
    longitude,
    road_accessibility,
    icing_risk,
    responsible_team,
    build_year,
  } = req.body;
  if (
    !line_id ||
    !tower_no ||
    altitude == null ||
    !road_accessibility ||
    !icing_risk ||
    !responsible_team
  ) {
    return res.status(400).json({ error: "缺少必填字段" });
  }
  try {
    const info = db
      .prepare(
        `
      INSERT INTO towers (line_id, tower_no, type, altitude, latitude, longitude, road_accessibility, icing_risk, responsible_team, build_year)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        line_id,
        tower_no,
        type,
        altitude,
        latitude,
        longitude,
        road_accessibility,
        icing_risk,
        responsible_team,
        build_year,
      );
    const tower = db
      .prepare("SELECT * FROM towers WHERE id = ?")
      .get(info.lastInsertRowid);
    res.status(201).json(tower);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/:id", (req, res) => {
  const tower = db
    .prepare("SELECT * FROM towers WHERE id = ?")
    .get(req.params.id);
  if (!tower) return res.status(404).json({ error: "杆塔不存在" });

  const {
    line_id,
    tower_no,
    type,
    altitude,
    latitude,
    longitude,
    road_accessibility,
    icing_risk,
    responsible_team,
    build_year,
  } = req.body;
  db.prepare(
    `
    UPDATE towers SET
      line_id = COALESCE(?, line_id),
      tower_no = COALESCE(?, tower_no),
      type = COALESCE(?, type),
      altitude = COALESCE(?, altitude),
      latitude = COALESCE(?, latitude),
      longitude = COALESCE(?, longitude),
      road_accessibility = COALESCE(?, road_accessibility),
      icing_risk = COALESCE(?, icing_risk),
      responsible_team = COALESCE(?, responsible_team),
      build_year = COALESCE(?, build_year)
    WHERE id = ?
  `,
  ).run(
    line_id,
    tower_no,
    type,
    altitude,
    latitude,
    longitude,
    road_accessibility,
    icing_risk,
    responsible_team,
    build_year,
    req.params.id,
  );

  const updated = db
    .prepare("SELECT * FROM towers WHERE id = ?")
    .get(req.params.id);
  res.json(updated);
});

router.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM towers WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "杆塔不存在" });
  res.json({ message: "已删除" });
});

module.exports = router;
