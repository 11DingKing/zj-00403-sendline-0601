const db = require("./db");
let recalcCapacity = null;

function loadRecalcCapacity() {
  if (!recalcCapacity) {
    try {
      const defectsModule = require("./routes/defects");
      recalcCapacity = defectsModule.recalcCapacity;
    } catch (e) {
      recalcCapacity = () => {};
    }
  }
  return recalcCapacity;
}

function seed() {
  const calcCap = loadRecalcCapacity();
  const tx = db.transaction(() => {
    db.exec(
      "DELETE FROM crossing_points; DELETE FROM hazard_points; DELETE FROM inspection_records; DELETE FROM defect_orders; DELETE FROM inspection_tasks; DELETE FROM segments; DELETE FROM towers; DELETE FROM lines;",
    );

    const insertLine = db.prepare(`
      INSERT INTO lines (name, voltage, length_km, start_point, end_point, status, capacity_mw, current_capacity_mw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const line1 = insertLine.run(
      "风电场I回220kV送出线路",
      "220kV",
      23.5,
      "青山风电场",
      "青山220kV变电站",
      "正常",
      200,
      200,
    ).lastInsertRowid;
    const line2 = insertLine.run(
      "风电场II回220kV送出线路",
      "220kV",
      21.8,
      "碧湖风电场",
      "碧湖220kV变电站",
      "正常",
      180,
      180,
    ).lastInsertRowid;

    const insertTower = db.prepare(`
      INSERT INTO towers (line_id, tower_no, type, altitude, latitude, longitude, road_accessibility, icing_risk, responsible_team, build_year)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const towerData = [
      [
        line1,
        "N1",
        "直线塔",
        320,
        29.1234,
        119.4567,
        "良好",
        "低",
        "运维一班",
        2019,
      ],
      [
        line1,
        "N2",
        "直线塔",
        450,
        29.1245,
        119.4578,
        "一般",
        "中",
        "运维一班",
        2019,
      ],
      [
        line1,
        "N3",
        "耐张塔",
        620,
        29.1256,
        119.4589,
        "困难",
        "高",
        "运维一班",
        2019,
      ],
      [
        line1,
        "N4",
        "直线塔",
        780,
        29.1267,
        119.46,
        "困难",
        "高",
        "运维一班",
        2019,
      ],
      [
        line1,
        "N5",
        "耐张塔",
        650,
        29.1278,
        119.4611,
        "一般",
        "中",
        "运维一班",
        2019,
      ],
      [
        line1,
        "N6",
        "直线塔",
        510,
        29.1289,
        119.4622,
        "一般",
        "低",
        "运维一班",
        2019,
      ],
      [
        line1,
        "N7",
        "直线塔",
        380,
        29.13,
        119.4633,
        "良好",
        "低",
        "运维一班",
        2019,
      ],
      [
        line1,
        "N8",
        "耐张塔",
        300,
        29.1311,
        119.4644,
        "良好",
        "低",
        "运维一班",
        2019,
      ],
      [
        line2,
        "T1",
        "直线塔",
        280,
        29.2234,
        119.5567,
        "良好",
        "低",
        "运维二班",
        2020,
      ],
      [
        line2,
        "T2",
        "直线塔",
        410,
        29.2245,
        119.5578,
        "一般",
        "中",
        "运维二班",
        2020,
      ],
      [
        line2,
        "T3",
        "耐张塔",
        580,
        29.2256,
        119.5589,
        "困难",
        "高",
        "运维二班",
        2020,
      ],
      [
        line2,
        "T4",
        "直线塔",
        720,
        29.2267,
        119.56,
        "困难",
        "高",
        "运维二班",
        2020,
      ],
      [
        line2,
        "T5",
        "直线塔",
        560,
        29.2278,
        119.5611,
        "一般",
        "中",
        "运维二班",
        2020,
      ],
      [
        line2,
        "T6",
        "耐张塔",
        420,
        29.2289,
        119.5622,
        "一般",
        "低",
        "运维二班",
        2020,
      ],
      [
        line2,
        "T7",
        "直线塔",
        310,
        29.23,
        119.5633,
        "良好",
        "低",
        "运维二班",
        2020,
      ],
    ];
    const towerIds = [];
    towerData.forEach((t) =>
      towerIds.push(insertTower.run(...t).lastInsertRowid),
    );

    const insertSegment = db.prepare(`
      INSERT INTO segments (line_id, segment_no, start_tower_id, end_tower_id, length_km, altitude_avg, road_accessibility, icing_risk, responsible_team, max_capacity_mw, current_capacity_mw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const segmentData = [
      [
        line1,
        "S01",
        towerIds[0],
        towerIds[2],
        3.2,
        463,
        "一般",
        "中",
        "运维一班",
        200,
        200,
      ],
      [
        line1,
        "S02",
        towerIds[2],
        towerIds[4],
        2.8,
        683,
        "困难",
        "高",
        "运维一班",
        200,
        200,
      ],
      [
        line1,
        "S03",
        towerIds[4],
        towerIds[7],
        4.1,
        485,
        "一般",
        "低",
        "运维一班",
        200,
        200,
      ],
      [
        line2,
        "S01",
        towerIds[7],
        towerIds[9],
        2.9,
        423,
        "一般",
        "中",
        "运维二班",
        180,
        180,
      ],
      [
        line2,
        "S02",
        towerIds[9],
        towerIds[11],
        3.1,
        653,
        "困难",
        "高",
        "运维二班",
        180,
        180,
      ],
      [
        line2,
        "S03",
        towerIds[11],
        towerIds[14],
        2.8,
        430,
        "一般",
        "低",
        "运维二班",
        180,
        180,
      ],
    ];
    const segmentIds = [];
    segmentData.forEach((s) =>
      segmentIds.push(insertSegment.run(...s).lastInsertRowid),
    );

    const insertCrossing = db.prepare(`
      INSERT INTO crossing_points (segment_id, crossing_type, description, distance_from_start, protection_level)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertCrossing.run(
      segmentIds[0],
      "公路",
      "跨越S201省道，距路面高度18m",
      1.2,
      "一级",
    );
    insertCrossing.run(
      segmentIds[0],
      "河流",
      "跨越青河，跨距320m",
      2.5,
      "二级",
    );
    insertCrossing.run(segmentIds[2], "铁路", "跨越青山支线铁路", 3.0, "一级");
    insertCrossing.run(segmentIds[3], "公路", "跨越乡道Y003", 1.5, "二级");
    insertCrossing.run(
      segmentIds[4],
      "10kV线路",
      "跨越10kV碧湖线",
      2.2,
      "二级",
    );

    const insertHazard = db.prepare(`
      INSERT INTO hazard_points (segment_id, hazard_type, description, risk_level, distance_from_start, mitigation_measures)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertHazard.run(
      segmentIds[1],
      "地质滑坡",
      "塔基位于半山腰，雨季易发生土体滑移",
      "高",
      1.8,
      "设置挡土墙，定期监测位移",
    );
    insertHazard.run(
      segmentIds[1],
      "覆冰",
      "高海拔区段，冬季覆冰厚度可达20mm",
      "高",
      2.5,
      "安装融冰装置，增加巡检频次",
    );
    insertHazard.run(
      segmentIds[4],
      "山火",
      "林区通道，春秋干燥季节易发山火",
      "中",
      1.2,
      "开设防火隔离带，定期清理通道",
    );
    insertHazard.run(
      segmentIds[4],
      "覆冰",
      "海拔700m以上区段冬季覆冰",
      "高",
      2.8,
      "缩短巡检周期，重点关注导地线",
    );

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const daysAgo = (n) => {
      const d = new Date(today);
      d.setDate(d.getDate() - n);
      return d.toISOString().split("T")[0];
    };
    const daysLater = (n) => {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return d.toISOString().split("T")[0];
    };

    const insertTask = db.prepare(`
      INSERT INTO inspection_tasks (segment_id, task_type, cycle_days, planned_date, status, inspector, actual_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const task1 = insertTask.run(
      segmentIds[0],
      "定期巡检",
      30,
      daysAgo(25),
      "已完成",
      "张三",
      daysAgo(23),
    ).lastInsertRowid;
    const task2 = insertTask.run(
      segmentIds[1],
      "定期巡检",
      15,
      daysAgo(20),
      "已完成",
      "李四",
      daysAgo(18),
    ).lastInsertRowid;
    const task3 = insertTask.run(
      segmentIds[2],
      "定期巡检",
      30,
      daysAgo(15),
      "已完成",
      "王五",
      daysAgo(13),
    ).lastInsertRowid;
    const task4 = insertTask.run(
      segmentIds[3],
      "定期巡检",
      20,
      daysAgo(10),
      "已完成",
      "赵六",
      daysAgo(8),
    ).lastInsertRowid;
    const task5 = insertTask.run(
      segmentIds[4],
      "定期巡检",
      15,
      daysAgo(5),
      "已完成",
      "孙七",
      daysAgo(3),
    ).lastInsertRowid;
    const task6 = insertTask.run(
      segmentIds[1],
      "定期巡检",
      15,
      todayStr,
      "待执行",
      "李四",
      null,
    ).lastInsertRowid;
    const task7 = insertTask.run(
      segmentIds[4],
      "定期巡检",
      15,
      daysLater(2),
      "待执行",
      "孙七",
      null,
    ).lastInsertRowid;
    const task8 = insertTask.run(
      segmentIds[0],
      "临时巡检",
      0,
      todayStr,
      "待执行",
      "张三",
      null,
    ).lastInsertRowid;

    const insertRecord = db.prepare(`
      INSERT INTO inspection_records (
        task_id, tower_id, inspector, inspection_date, weather,
        insulator_status, insulator_notes,
        fitting_status, fitting_notes,
        conductor_sag, conductor_sag_status, conductor_notes,
        tower_slope_status, tower_slope_notes,
        channel_tree_status, channel_tree_notes,
        overall_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const records = [
      [
        task1,
        towerIds[0],
        "张三",
        daysAgo(23),
        "晴",
        "正常",
        null,
        "正常",
        null,
        6.2,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
      [
        task1,
        towerIds[1],
        "张三",
        daysAgo(23),
        "晴",
        "正常",
        null,
        "正常",
        null,
        6.5,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
      [
        task1,
        towerIds[2],
        "张三",
        daysAgo(23),
        "晴",
        "异常",
        "N3塔A相绝缘子有轻微破损",
        "正常",
        null,
        5.8,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "异常",
        "发现绝缘子缺陷",
      ],
      [
        task2,
        towerIds[2],
        "李四",
        daysAgo(18),
        "多云",
        "正常",
        null,
        "正常",
        null,
        7.1,
        "正常",
        null,
        "异常",
        "塔基东侧土体有细微裂缝",
        "正常",
        null,
        "异常",
        "塔基边坡隐患",
      ],
      [
        task2,
        towerIds[3],
        "李四",
        daysAgo(18),
        "多云",
        "危急",
        "N4塔B相绝缘子自爆2片",
        "异常",
        "U型挂环磨损严重",
        8.5,
        "异常",
        "弧垂偏大，接近设计限值",
        "正常",
        null,
        "异常",
        "通道下方有树木接近安全距离",
        "危急",
        "多处严重缺陷需立即处理",
      ],
      [
        task2,
        towerIds[4],
        "李四",
        daysAgo(18),
        "多云",
        "正常",
        null,
        "正常",
        null,
        6.9,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
      [
        task3,
        towerIds[4],
        "王五",
        daysAgo(13),
        "阴",
        "正常",
        null,
        "正常",
        null,
        6.4,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
      [
        task3,
        towerIds[5],
        "王五",
        daysAgo(13),
        "阴",
        "正常",
        null,
        "正常",
        null,
        6.8,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
      [
        task3,
        towerIds[6],
        "王五",
        daysAgo(13),
        "阴",
        "正常",
        null,
        "正常",
        null,
        6.1,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
      [
        task3,
        towerIds[7],
        "王五",
        daysAgo(13),
        "阴",
        "正常",
        null,
        "正常",
        null,
        5.9,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
      [
        task4,
        towerIds[7],
        "赵六",
        daysAgo(8),
        "晴",
        "正常",
        null,
        "正常",
        null,
        5.7,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
      [
        task4,
        towerIds[8],
        "赵六",
        daysAgo(8),
        "晴",
        "正常",
        null,
        "正常",
        null,
        6.0,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
      [
        task4,
        towerIds[9],
        "赵六",
        daysAgo(8),
        "晴",
        "异常",
        "T2塔C相绝缘子有污秽沉积",
        "正常",
        null,
        6.3,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "异常",
        null,
      ],
      [
        task5,
        towerIds[9],
        "孙七",
        daysAgo(3),
        "小雨",
        "正常",
        null,
        "正常",
        null,
        6.6,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
      [
        task5,
        towerIds[10],
        "孙七",
        daysAgo(3),
        "小雨",
        "正常",
        null,
        "正常",
        null,
        7.8,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
      [
        task5,
        towerIds[11],
        "孙七",
        daysAgo(3),
        "小雨",
        "异常",
        "T4塔A相绝缘子串倾斜",
        "正常",
        null,
        9.2,
        "异常",
        "弧垂超标，可能对地距离不足",
        "正常",
        null,
        "危急",
        "通道下方有高大乔木，距离导线不足3m",
        "异常",
        "发现树障和弧垂问题",
      ],
      [
        task5,
        towerIds[12],
        "孙七",
        daysAgo(3),
        "小雨",
        "正常",
        null,
        "正常",
        null,
        7.1,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
        "正常",
        null,
      ],
    ];

    const recordIds = [];
    records.forEach((r) =>
      recordIds.push(insertRecord.run(...r).lastInsertRowid),
    );

    const insertDefect = db.prepare(`
      INSERT INTO defect_orders (record_id, segment_id, defect_type, description, severity, status, assignee, deadline, handled_at, handler, handle_notes, reviewed_at, reviewer, review_notes, capacity_restricted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defects = [
      [
        recordIds[2],
        segmentIds[0],
        "绝缘子缺陷",
        "N3塔A相绝缘子轻微破损",
        "一般",
        "已关闭",
        "运维一班",
        daysAgo(16),
        daysAgo(18),
        "李四",
        "已更换破损绝缘子",
        daysAgo(16),
        "王主任",
        "更换合格，复核通过",
        0,
      ],
      [
        recordIds[3],
        segmentIds[1],
        "塔基边坡异常",
        "N3塔东侧土体出现细微裂缝，需监测",
        "一般",
        "处理中",
        "运维一班",
        daysLater(5),
        null,
        null,
        null,
        null,
        null,
        null,
        0,
      ],
      [
        recordIds[4],
        segmentIds[1],
        "绝缘子缺陷",
        "N4塔B相绝缘子自爆2片，影响绝缘性能",
        "危急",
        "处理中",
        "运维一班",
        daysAgo(17),
        null,
        null,
        null,
        null,
        null,
        null,
        1,
      ],
      [
        recordIds[4],
        segmentIds[1],
        "金具缺陷",
        "N4塔U型挂环磨损严重，存在断裂风险",
        "严重",
        "已关闭",
        "运维一班",
        daysAgo(11),
        daysAgo(14),
        "张三",
        "已更换全套金具",
        daysAgo(12),
        "王主任",
        "金具更换规范，复核通过",
        0,
      ],
      [
        recordIds[4],
        segmentIds[1],
        "导线弧垂异常",
        "N4塔弧垂偏大，接近设计限值",
        "严重",
        "待处理",
        "运维一班",
        daysAgo(11),
        null,
        null,
        null,
        null,
        null,
        null,
        0,
      ],
      [
        recordIds[4],
        segmentIds[1],
        "通道树障",
        "N4塔通道下方树木接近安全距离",
        "一般",
        "已关闭",
        "运维一班",
        daysAgo(16),
        daysAgo(20),
        "李四",
        "已砍伐清理通道树木12棵",
        daysAgo(19),
        "王主任",
        "清理彻底，通道达标",
        0,
      ],
      [
        recordIds[12],
        segmentIds[3],
        "绝缘子缺陷",
        "T2塔C相绝缘子污秽较严重",
        "一般",
        "已关闭",
        "运维二班",
        daysAgo(1),
        daysAgo(5),
        "赵六",
        "已完成绝缘子带电清扫",
        daysAgo(4),
        "李主任",
        "清扫合格，绝缘恢复正常",
        0,
      ],
      [
        recordIds[15],
        segmentIds[4],
        "绝缘子缺陷",
        "T4塔A相绝缘子串倾斜",
        "严重",
        "待处理",
        "运维二班",
        daysLater(4),
        null,
        null,
        null,
        null,
        null,
        null,
        0,
      ],
      [
        recordIds[15],
        segmentIds[4],
        "导线弧垂异常",
        "T4塔弧垂超标，对地距离不足",
        "严重",
        "处理中",
        "运维二班",
        daysLater(4),
        daysAgo(2),
        "孙七",
        "已完成导地线紧线调整",
        null,
        null,
        null,
        0,
      ],
      [
        recordIds[15],
        segmentIds[4],
        "通道树障",
        "T4塔下方乔木距离导线不足3m，存在放电风险",
        "危急",
        "处理中",
        "运维二班",
        daysAgo(2),
        daysAgo(1),
        "孙七",
        "已砍伐通道内高大乔木8棵，剩余3棵正在处理",
        null,
        null,
        null,
        1,
      ],
    ];
    defects.forEach((d) => insertDefect.run(...d));

    segmentIds.forEach((sid) => calcCap(sid));
  });

  tx();
  console.log("种子数据写入完成！");
  console.log("包含：2条送出线路，15基杆塔，6个区段，5个跨越点，4个隐患点");
  console.log("8个巡检任务，17条巡检记录，10条缺陷工单");
}

function seedIfNeeded() {
  try {
    const lineCount = db.prepare("SELECT COUNT(*) as c FROM lines").get().c;
    if (lineCount === 0) {
      seed();
      return true;
    }
    return false;
  } catch (e) {
    seed();
    return true;
  }
}

if (require.main === module) {
  seed();
}

module.exports = { seed, seedIfNeeded };
