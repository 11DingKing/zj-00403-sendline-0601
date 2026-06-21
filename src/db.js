const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "inspection.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      voltage TEXT NOT NULL,
      length_km REAL NOT NULL,
      start_point TEXT NOT NULL,
      end_point TEXT NOT NULL,
      status TEXT DEFAULT '正常',
      capacity_mw REAL NOT NULL,
      current_capacity_mw REAL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS towers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_id INTEGER NOT NULL,
      tower_no TEXT NOT NULL,
      type TEXT,
      altitude REAL NOT NULL,
      latitude REAL,
      longitude REAL,
      road_accessibility TEXT NOT NULL,
      icing_risk TEXT NOT NULL,
      responsible_team TEXT NOT NULL,
      build_year INTEGER,
      FOREIGN KEY (line_id) REFERENCES lines(id),
      UNIQUE(line_id, tower_no)
    );

    CREATE TABLE IF NOT EXISTS segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_id INTEGER NOT NULL,
      segment_no TEXT NOT NULL,
      start_tower_id INTEGER NOT NULL,
      end_tower_id INTEGER NOT NULL,
      length_km REAL NOT NULL,
      altitude_avg REAL,
      road_accessibility TEXT NOT NULL,
      icing_risk TEXT NOT NULL,
      flood_risk_level TEXT DEFAULT '低',
      responsible_team TEXT NOT NULL,
      max_capacity_mw REAL,
      current_capacity_mw REAL,
      FOREIGN KEY (line_id) REFERENCES lines(id),
      FOREIGN KEY (start_tower_id) REFERENCES towers(id),
      FOREIGN KEY (end_tower_id) REFERENCES towers(id)
    );

    CREATE TABLE IF NOT EXISTS crossing_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      segment_id INTEGER NOT NULL,
      crossing_type TEXT NOT NULL,
      description TEXT,
      distance_from_start REAL,
      protection_level TEXT,
      flood_risk_level TEXT DEFAULT '低',
      FOREIGN KEY (segment_id) REFERENCES segments(id)
    );

    CREATE TABLE IF NOT EXISTS hazard_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      segment_id INTEGER NOT NULL,
      hazard_type TEXT NOT NULL,
      description TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      flood_risk_level TEXT DEFAULT '低',
      distance_from_start REAL,
      mitigation_measures TEXT,
      FOREIGN KEY (segment_id) REFERENCES segments(id)
    );

    CREATE TABLE IF NOT EXISTS inspection_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      segment_id INTEGER NOT NULL,
      task_type TEXT NOT NULL,
      cycle_days INTEGER NOT NULL,
      planned_date TEXT NOT NULL,
      status TEXT DEFAULT '待执行',
      inspector TEXT,
      actual_date TEXT,
      flood_season INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (segment_id) REFERENCES segments(id)
    );

    CREATE TABLE IF NOT EXISTS inspection_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      tower_id INTEGER,
      inspector TEXT NOT NULL,
      inspection_date TEXT NOT NULL,
      weather TEXT,
      insulator_status TEXT,
      insulator_notes TEXT,
      fitting_status TEXT,
      fitting_notes TEXT,
      conductor_sag REAL,
      conductor_sag_status TEXT,
      conductor_notes TEXT,
      tower_slope_status TEXT,
      tower_slope_notes TEXT,
      channel_tree_status TEXT,
      channel_tree_notes TEXT,
      overall_status TEXT DEFAULT '正常',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (task_id) REFERENCES inspection_tasks(id),
      FOREIGN KEY (tower_id) REFERENCES towers(id)
    );

    CREATE TABLE IF NOT EXISTS defect_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      segment_id INTEGER NOT NULL,
      defect_type TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      location TEXT,
      status TEXT DEFAULT '待处理',
      assignee TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      deadline TEXT,
      handled_at TEXT,
      handler TEXT,
      handle_notes TEXT,
      reviewed_at TEXT,
      reviewer TEXT,
      review_notes TEXT,
      capacity_restricted INTEGER DEFAULT 0,
      flood_related INTEGER DEFAULT 0,
      FOREIGN KEY (record_id) REFERENCES inspection_records(id),
      FOREIGN KEY (segment_id) REFERENCES segments(id)
    );
  `);
}

function migrateTables() {
  const columns = (table) => {
    try {
      return db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);
    } catch (e) {
      return [];
    }
  };

  const towerCols = columns("towers");
  if (!towerCols.includes("slope_flood_risk")) {
    db.prepare(
      `ALTER TABLE towers ADD COLUMN slope_flood_risk TEXT DEFAULT '低'`,
    ).run();
  }

  const segCols = columns("segments");
  if (!segCols.includes("flood_risk_level")) {
    db.prepare(
      `ALTER TABLE segments ADD COLUMN flood_risk_level TEXT DEFAULT '低'`,
    ).run();
  }

  const crossCols = columns("crossing_points");
  if (!crossCols.includes("flood_risk_level")) {
    db.prepare(
      `ALTER TABLE crossing_points ADD COLUMN flood_risk_level TEXT DEFAULT '低'`,
    ).run();
  }

  const hazardCols = columns("hazard_points");
  if (!hazardCols.includes("flood_risk_level")) {
    db.prepare(
      `ALTER TABLE hazard_points ADD COLUMN flood_risk_level TEXT DEFAULT '低'`,
    ).run();
  }

  const taskCols = columns("inspection_tasks");
  if (!taskCols.includes("flood_season")) {
    db.prepare(
      `ALTER TABLE inspection_tasks ADD COLUMN flood_season INTEGER DEFAULT 0`,
    ).run();
  }

  const defectCols = columns("defect_orders");
  if (!defectCols.includes("flood_related")) {
    db.prepare(
      `ALTER TABLE defect_orders ADD COLUMN flood_related INTEGER DEFAULT 0`,
    ).run();
  }
}

initTables();
migrateTables();

function isFloodSeason(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const month = d.getMonth() + 1;
  return month >= 5 && month <= 9;
}

function getFloodRiskCycle(baseDays, floodRiskLevel) {
  if (!isFloodSeason()) return baseDays;
  if (floodRiskLevel === "高") return Math.max(3, Math.floor(baseDays * 0.4));
  if (floodRiskLevel === "中") return Math.max(5, Math.floor(baseDays * 0.6));
  return baseDays;
}

db.isFloodSeason = isFloodSeason;
db.getFloodRiskCycle = getFloodRiskCycle;

module.exports = db;
