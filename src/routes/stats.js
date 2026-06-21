const express = require("express");
const db = require("../db");
const router = express.Router();

function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
}

router.get("/defect-density", (req, res) => {
  const segments = db
    .prepare(
      `
    SELECT s.id, s.segment_no, s.length_km, l.name as line_name, l.id as line_id
    FROM segments s
    LEFT JOIN lines l ON s.line_id = l.id
  `,
    )
    .all();

  const result = segments.map((seg) => {
    const totalDefects = db
      .prepare(
        "SELECT COUNT(*) as c FROM defect_orders WHERE segment_id = ? AND status IN ('待处理', '处理中', '待复核')",
      )
      .get(seg.id).c;
    const bySeverity = db
      .prepare(
        `
      SELECT severity, COUNT(*) as c FROM defect_orders
      WHERE segment_id = ? AND status IN ('待处理', '处理中', '待复核') GROUP BY severity
    `,
      )
      .all(seg.id);
    const severityMap = {};
    bySeverity.forEach((r) => (severityMap[r.severity] = r.c));

    return {
      segment_id: seg.id,
      segment_no: seg.segment_no,
      line_name: seg.line_name,
      line_id: seg.line_id,
      length_km: seg.length_km,
      total_defects: totalDefects,
      defects_per_km:
        seg.length_km > 0 ? +(totalDefects / seg.length_km).toFixed(2) : 0,
      by_severity: {
        危急: severityMap["危急"] || 0,
        严重: severityMap["严重"] || 0,
        一般: severityMap["一般"] || 0,
      },
    };
  });

  result.sort((a, b) => b.defects_per_km - a.defects_per_km);
  res.json(result);
});

router.get("/repair-duration", (req, res) => {
  const closedDefects = db
    .prepare(
      `
    SELECT df.*, s.segment_no, l.name as line_name
    FROM defect_orders df
    LEFT JOIN segments s ON df.segment_id = s.id
    LEFT JOIN lines l ON s.line_id = l.id
    WHERE df.status = '已关闭' AND df.handled_at IS NOT NULL
  `,
    )
    .all();

  const perSegment = {};
  closedDefects.forEach((d) => {
    const duration = daysBetween(d.created_at, d.handled_at);
    if (!perSegment[d.segment_id]) {
      perSegment[d.segment_id] = {
        segment_id: d.segment_id,
        segment_no: d.segment_no,
        line_name: d.line_name,
        durations: [],
        by_severity: {},
      };
    }
    perSegment[d.segment_id].durations.push(duration);
    if (!perSegment[d.segment_id].by_severity[d.severity]) {
      perSegment[d.segment_id].by_severity[d.severity] = [];
    }
    perSegment[d.segment_id].by_severity[d.severity].push(duration);
  });

  const result = Object.values(perSegment).map((seg) => {
    const avg = (arr) =>
      arr.length > 0
        ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)
        : 0;
    const bySeverityAvg = {};
    Object.keys(seg.by_severity).forEach((s) => {
      bySeverityAvg[s] = avg(seg.by_severity[s]);
    });
    return {
      segment_id: seg.segment_id,
      segment_no: seg.segment_no,
      line_name: seg.line_name,
      total_closed: seg.durations.length,
      avg_duration_days: avg(seg.durations),
      max_duration_days: Math.max(...seg.durations),
      min_duration_days: Math.min(...seg.durations),
      avg_by_severity: bySeverityAvg,
    };
  });

  result.sort((a, b) => b.avg_duration_days - a.avg_duration_days);

  const overallDurations = closedDefects.map((d) =>
    daysBetween(d.created_at, d.handled_at),
  );
  const overallAvg =
    overallDurations.length > 0
      ? +(
          overallDurations.reduce((a, b) => a + b, 0) / overallDurations.length
        ).toFixed(1)
      : 0;

  res.json({
    overall: {
      total_closed: closedDefects.length,
      avg_duration_days: overallAvg,
      max_duration_days:
        overallDurations.length > 0 ? Math.max(...overallDurations) : 0,
      min_duration_days:
        overallDurations.length > 0 ? Math.min(...overallDurations) : 0,
    },
    by_segment: result,
  });
});

router.get("/overdue", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const overdue = db
    .prepare(
      `
    SELECT df.*, s.segment_no, l.name as line_name, s.responsible_team
    FROM defect_orders df
    LEFT JOIN segments s ON df.segment_id = s.id
    LEFT JOIN lines l ON s.line_id = l.id
    WHERE df.status IN ('待处理', '处理中', '待复核') AND df.deadline < ?
    ORDER BY df.deadline ASC
  `,
    )
    .all(today);

  const perSegment = {};
  const perTeam = {};
  overdue.forEach((d) => {
    const overdueDays = daysBetween(d.deadline, today);
    d.overdue_days = overdueDays;
    if (!perSegment[d.segment_id]) {
      perSegment[d.segment_id] = {
        segment_id: d.segment_id,
        segment_no: d.segment_no,
        line_name: d.line_name,
        count: 0,
        by_severity: {},
      };
    }
    perSegment[d.segment_id].count++;
    perSegment[d.segment_id].by_severity[d.severity] =
      (perSegment[d.segment_id].by_severity[d.severity] || 0) + 1;

    if (d.responsible_team) {
      if (!perTeam[d.responsible_team]) {
        perTeam[d.responsible_team] = { team: d.responsible_team, count: 0 };
      }
      perTeam[d.responsible_team].count++;
    }
  });

  res.json({
    total_overdue: overdue.length,
    by_severity: {
      危急: overdue.filter((d) => d.severity === "危急").length,
      严重: overdue.filter((d) => d.severity === "严重").length,
      一般: overdue.filter((d) => d.severity === "一般").length,
    },
    by_segment: Object.values(perSegment).sort((a, b) => b.count - a.count),
    by_team: Object.values(perTeam).sort((a, b) => b.count - a.count),
    items: overdue,
  });
});

router.get("/availability", (req, res) => {
  const lines = db.prepare("SELECT * FROM lines").all();
  const segments = db
    .prepare(
      `
    SELECT s.*, l.name as line_name, l.id as line_id, l.capacity_mw as line_max_capacity
    FROM segments s
    LEFT JOIN lines l ON s.line_id = l.id
  `,
    )
    .all();

  const days = 30;
  const today = new Date();

  const segmentAvailability = segments.map((seg) => {
    const restrictedDefects = db
      .prepare(
        `
      SELECT created_at, reviewed_at, status, severity, flood_related
      FROM defect_orders
      WHERE segment_id = ? AND capacity_restricted = 1
    `,
      )
      .all(seg.id);

    let restrictedDays = 0;
    let floodRestrictedDays = 0;
    restrictedDefects.forEach((d) => {
      const start = new Date(d.created_at);
      const end = d.reviewed_at ? new Date(d.reviewed_at) : today;
      for (let i = 0; i < days; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        if (checkDate >= start && checkDate <= end) {
          restrictedDays++;
          if (d.flood_related) floodRestrictedDays++;
        }
      }
    });

    const availabilityRatio = +((1 - restrictedDays / days) * 100).toFixed(2);
    const floodAvailabilityRatio = +(
      (1 - floodRestrictedDays / days) *
      100
    ).toFixed(2);
    const capacityRatio =
      seg.max_capacity_mw > 0
        ? +((seg.current_capacity_mw / seg.max_capacity_mw) * 100).toFixed(2)
        : 0;

    return {
      segment_id: seg.id,
      segment_no: seg.segment_no,
      line_name: seg.line_name,
      line_id: seg.line_id,
      flood_risk_level: seg.flood_risk_level,
      availability_30d: availabilityRatio,
      flood_availability_30d: floodAvailabilityRatio,
      restricted_days_30d: restrictedDays,
      flood_restricted_days_30d: floodRestrictedDays,
      max_capacity_mw: seg.max_capacity_mw,
      current_capacity_mw: seg.current_capacity_mw,
      capacity_ratio: capacityRatio,
    };
  });

  const lineAvailability = lines.map((line) => {
    const segStats = segmentAvailability.filter((s) => s.line_id === line.id);
    const avgAvailability =
      segStats.length > 0
        ? +(
            segStats.reduce((a, b) => a + b.availability_30d, 0) /
            segStats.length
          ).toFixed(2)
        : 100;
    const avgFloodAvailability =
      segStats.length > 0
        ? +(
            segStats.reduce((a, b) => a + b.flood_availability_30d, 0) /
            segStats.length
          ).toFixed(2)
        : 100;
    const capacityRatio =
      line.capacity_mw > 0
        ? +((line.current_capacity_mw / line.capacity_mw) * 100).toFixed(2)
        : 0;

    const highFloodSegments = segStats.filter(
      (s) => s.flood_risk_level === "高",
    ).length;
    const mediumFloodSegments = segStats.filter(
      (s) => s.flood_risk_level === "中",
    ).length;

    return {
      line_id: line.id,
      line_name: line.name,
      voltage: line.voltage,
      length_km: line.length_km,
      availability_30d: avgAvailability,
      flood_availability_30d: avgFloodAvailability,
      capacity_ratio: capacityRatio,
      max_capacity_mw: line.capacity_mw,
      current_capacity_mw: line.current_capacity_mw,
      segment_count: segStats.length,
      flood_risk_segments: {
        high: highFloodSegments,
        medium: mediumFloodSegments,
        low: segStats.length - highFloodSegments - mediumFloodSegments,
      },
    };
  });

  const overall = {
    total_lines: lines.length,
    total_segments: segments.length,
    avg_availability_30d:
      lines.length > 0
        ? +(
            lineAvailability.reduce((a, b) => a + b.availability_30d, 0) /
            lines.length
          ).toFixed(2)
        : 100,
    avg_flood_availability_30d:
      lines.length > 0
        ? +(
            lineAvailability.reduce((a, b) => a + b.flood_availability_30d, 0) /
            lines.length
          ).toFixed(2)
        : 100,
    total_max_capacity_mw: +lines
      .reduce((a, b) => a + b.capacity_mw, 0)
      .toFixed(2),
    total_current_capacity_mw: +lines
      .reduce((a, b) => a + (b.current_capacity_mw || 0), 0)
      .toFixed(2),
    overall_capacity_ratio:
      lines.length > 0 && lines.reduce((a, b) => a + b.capacity_mw, 0) > 0
        ? +(
            (lines.reduce((a, b) => a + (b.current_capacity_mw || 0), 0) /
              lines.reduce((a, b) => a + b.capacity_mw, 0)) *
            100
          ).toFixed(2)
        : 100,
    is_flood_season: db.isFloodSeason(),
    flood_risk_segments: {
      high: segments.filter((s) => s.flood_risk_level === "高").length,
      medium: segments.filter((s) => s.flood_risk_level === "中").length,
      low: segments.filter((s) => s.flood_risk_level === "低").length,
    },
  };

  res.json({
    overall,
    by_line: lineAvailability.sort(
      (a, b) => a.availability_30d - b.availability_30d,
    ),
    by_segment: segmentAvailability.sort(
      (a, b) => a.availability_30d - b.availability_30d,
    ),
  });
});

router.get("/flood-risk", (req, res) => {
  const segments = db
    .prepare(
      `
    SELECT s.*, l.name as line_name, l.id as line_id
    FROM segments s
    LEFT JOIN lines l ON s.line_id = l.id
    ORDER BY CASE s.flood_risk_level WHEN '高' THEN 1 WHEN '中' THEN 2 ELSE 3 END, s.id
  `,
    )
    .all();

  const result = segments.map((seg) => {
    const towers = db
      .prepare(
        "SELECT id, tower_no, slope_flood_risk FROM towers WHERE id IN (?, ?)",
      )
      .all(seg.start_tower_id, seg.end_tower_id);

    const crossings = db
      .prepare("SELECT * FROM crossing_points WHERE segment_id = ?")
      .all(seg.id);

    const hazards = db
      .prepare("SELECT * FROM hazard_points WHERE segment_id = ?")
      .all(seg.id);

    const activeFloodDefects = db
      .prepare(
        `SELECT COUNT(*) as c FROM defect_orders 
       WHERE segment_id = ? AND flood_related = 1 AND status IN ('待处理', '处理中', '待复核')`,
      )
      .get(seg.id).c;

    return {
      segment_id: seg.id,
      segment_no: seg.segment_no,
      line_id: seg.line_id,
      line_name: seg.line_name,
      flood_risk_level: seg.flood_risk_level,
      length_km: seg.length_km,
      responsible_team: seg.responsible_team,
      towers,
      crossings: crossings.map((c) => ({
        id: c.id,
        crossing_type: c.crossing_type,
        description: c.description,
        flood_risk_level: c.flood_risk_level,
      })),
      hazards: hazards.map((h) => ({
        id: h.id,
        hazard_type: h.hazard_type,
        description: h.description,
        risk_level: h.risk_level,
        flood_risk_level: h.flood_risk_level,
      })),
      active_flood_defects: activeFloodDefects,
      current_capacity_mw: seg.current_capacity_mw,
      max_capacity_mw: seg.max_capacity_mw,
      capacity_ratio:
        seg.max_capacity_mw > 0
          ? +((seg.current_capacity_mw / seg.max_capacity_mw) * 100).toFixed(2)
          : 0,
    };
  });

  const highRisk = result.filter((r) => r.flood_risk_level === "高").length;
  const mediumRisk = result.filter((r) => r.flood_risk_level === "中").length;
  const lowRisk = result.filter((r) => r.flood_risk_level === "低").length;

  res.json({
    is_flood_season: db.isFloodSeason(),
    total_segments: result.length,
    risk_distribution: {
      high: highRisk,
      medium: mediumRisk,
      low: lowRisk,
    },
    segments: result,
  });
});

router.get("/summary", (req, res) => {
  const totalLines = db.prepare("SELECT COUNT(*) as c FROM lines").get().c;
  const totalTowers = db.prepare("SELECT COUNT(*) as c FROM towers").get().c;
  const totalSegments = db
    .prepare("SELECT COUNT(*) as c FROM segments")
    .get().c;
  const totalTasks = db
    .prepare("SELECT COUNT(*) as c FROM inspection_tasks")
    .get().c;
  const pendingTasks = db
    .prepare(
      "SELECT COUNT(*) as c FROM inspection_tasks WHERE status = '待执行'",
    )
    .get().c;
  const totalRecords = db
    .prepare("SELECT COUNT(*) as c FROM inspection_records")
    .get().c;
  const totalDefects = db
    .prepare("SELECT COUNT(*) as c FROM defect_orders")
    .get().c;
  const defectsBySeverity = db
    .prepare(
      "SELECT severity, COUNT(*) as c FROM defect_orders GROUP BY severity",
    )
    .all();
  const defectsByStatus = db
    .prepare("SELECT status, COUNT(*) as c FROM defect_orders GROUP BY status")
    .all();
  const sevMap = {};
  defectsBySeverity.forEach((r) => (sevMap[r.severity] = r.c));
  const stMap = {};
  defectsByStatus.forEach((r) => (stMap[r.status] = r.c));

  const today = new Date().toISOString().split("T")[0];
  const overdue = db
    .prepare(
      `SELECT COUNT(*) as c FROM defect_orders WHERE status IN ('待处理','处理中','待复核') AND deadline < ?`,
    )
    .get(today).c;

  res.json({
    lines: totalLines,
    towers: totalTowers,
    segments: totalSegments,
    inspection_tasks: { total: totalTasks, pending: pendingTasks },
    inspection_records: totalRecords,
    defects: {
      total: totalDefects,
      by_severity: {
        危急: sevMap["危急"] || 0,
        严重: sevMap["严重"] || 0,
        一般: sevMap["一般"] || 0,
      },
      by_status: {
        待处理: stMap["待处理"] || 0,
        处理中: stMap["处理中"] || 0,
        待复核: stMap["待复核"] || 0,
        已关闭: stMap["已关闭"] || 0,
      },
      overdue: overdue,
    },
  });
});

module.exports = router;
