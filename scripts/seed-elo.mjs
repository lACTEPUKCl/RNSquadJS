import fs from 'fs';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const SEED_RD = 200;
const SEED_SIGMA = 0.06;
const COLLECTION = 'mainstats';
const MIN_MATCHES = 50;
const KD_MAX_BONUS = 650; // максимальный вклад kd (плато)
const KD_SHARP = 3.5; // меньше = быстрее выходит на плато
const WINRATE_WEIGHT = 0.5; // винрейт — командный шум, вклад минимальный (0 = выкл)
const SHARE_POWER = 0.5; // 1 = жёсткий срез технарей, 0.5 = мягкий (√), 0 = техника не влияет
const MU_MIN = 800;
const MU_MAX = 2600;
const MIN_KILLS_FOR_SHARE = 30; // мало киллов → не считаем долю, нейтрально
const CONF_K = 500; // объём киллов для «половинного» доверия (меньше выборка → ближе к 1500)

// командирский ELO (cmdRating) — из командирского винрейта
const MIN_CMD_GAMES = 10; // меньше игр командиром → не сеем (оставляем дефолт)
const CMD_WINRATE_WEIGHT = 12; // насколько cmd-винрейт тянет рейтинг
const CMD_CONF_K = 15; // объём cmd-игр для половинного доверия

// техничные/мунтед-киллы (НЕ личный пехотный скилл). Снайперки/РПГ/гранаты — пехота.
const VEHICLE_KILL_RE =
  /Projectile|Cannon|Coax|Autocannon|2A72|2A42|2A28|2A70|ZTM|KPVT|Kord|DSHK|DShK|NSV|PKT|RHIB|MI8|Mi8|Mi24|BMP|BMD|BTR|BRDM|MTLB|Tigr|Kozak|Arbalet|Kamaz|Kraz|Quadbike|Tank|T64|T72|T80|Heli|BM21|Grad|Mortar|SPG|Maxim|Browning|M2_|ZU23|AGS17|AGS30|MK19/i;

function weaponStats(weapons) {
  let total = 0;
  let veh = 0;
  if (weapons && typeof weapons === 'object') {
    for (const [w, n] of Object.entries(weapons)) {
      const c = Number(n) || 0;
      total += c;
      if (VEHICLE_KILL_RE.test(w)) veh += c;
    }
  }
  return { total, veh };
}

function seedMu(u) {
  const matches = Number(u?.matches?.matches ?? 0);
  let kd = Number(u?.kd ?? 1);
  const winrate = Number(u?.matches?.winrate ?? 50);

  // меньше MIN_MATCHES матчей → не откалиброван → нейтральные 1500
  if (matches < MIN_MATCHES) return { mu: 1500, inf: 100, kills: 0 };

  // нет разбивки по оружию → kd нечем подтвердить (вдруг технарь/накрутка) → нейтрально
  const { total, veh } = weaponStats(u?.weapons);
  if (total < MIN_KILLS_FOR_SHARE) return { mu: 1500, inf: 0, kills: total };

  // защита от kd = Infinity / мусора (на 50+ матчах смерти точно есть)
  if (!Number.isFinite(kd) || kd < 0) kd = 1;

  // личный kd (с насыщением), срез на технику, доверие по объёму выборки; винрейт — лёгкая поправка
  const share = Math.max(0, 1 - veh / total);
  const conf = total / (total + CONF_K);
  const kdBonus =
    KD_MAX_BONUS *
    Math.tanh((kd - 1) / KD_SHARP) *
    Math.pow(share, SHARE_POWER) *
    conf;
  const est = 1500 + kdBonus + (winrate - 50) * WINRATE_WEIGHT;
  return {
    mu: Math.round(Math.max(MU_MIN, Math.min(MU_MAX, est))),
    inf: Math.round(share * 100),
    kills: total,
  };
}

function seedCmdMu(u) {
  const won = Number(u?.matches?.cmdwon ?? 0);
  const lose = Number(u?.matches?.cmdlose ?? 0);
  const games = won + lose;
  if (games < MIN_CMD_GAMES) return null; // мало командовал → не сеем

  let cwr = Number(u?.matches?.cmdwinrate ?? 0);
  if (!Number.isFinite(cwr) || (cwr === 0 && games > 0)) cwr = (won / games) * 100;

  const conf = games / (games + CMD_CONF_K);
  const est = 1500 + (cwr - 50) * CMD_WINRATE_WEIGHT * conf;
  return {
    mu: Math.round(Math.max(MU_MIN, Math.min(MU_MAX, est))),
    games,
    cwr: Math.round(cwr),
  };
}

function uniqueTargets(cfg) {
  const seen = new Set();
  const out = [];
  for (const key of Object.keys(cfg)) {
    const s = cfg[key];
    if (!s || typeof s !== 'object' || !s.db || !s.database) continue;
    const k = `${s.db}::${s.database}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ uri: s.db, db: s.database });
  }
  return out;
}

async function run() {
  const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  const targets = uniqueTargets(cfg);
  if (targets.length === 0) {
    console.error('Не нашёл db/database в config.json');
    process.exit(1);
  }

  for (const t of targets) {
    console.log(`\n=== БД: ${t.db} / коллекция ${COLLECTION} ===`);
    const client = new MongoClient(t.uri);
    await client.connect();
    const col = client.db(t.db).collection(COLLECTION);

    const cursor = col.find(
      {},
      {
        projection: {
          _id: 1,
          name: 1,
          kd: 1,
          exp: 1,
          'matches.winrate': 1,
          'matches.matches': 1,
          'matches.cmdwon': 1,
          'matches.cmdlose': 1,
          'matches.cmdwinrate': 1,
          weapons: 1,
          rating: 1,
          cmdRating: 1,
        },
      },
    );

    let total = 0;
    let toSeed = 0;
    let skipped = 0;
    const board = [];
    const cmdBoard = [];
    const ops = [];

    for await (const u of cursor) {
      total++;
      if (u.rating && Number(u.rating.games) > 0) {
        skipped++;
        board.push({
          name: u.name,
          mu: Math.round(Number(u.rating.mu)),
          inf: '',
          kills: '',
          src: 'rated',
        });
        if (u.cmdRating && Number(u.cmdRating.games) > 0) {
          cmdBoard.push({
            name: u.name,
            cmdMu: Math.round(Number(u.cmdRating.mu)),
            games: '',
            cwr: '',
            src: 'rated',
          });
        }
        continue;
      }
      const { mu, inf, kills } = seedMu(u);
      toSeed++;
      board.push({ name: u.name, mu, inf, kills, src: 'seed' });

      const setDoc = {
        rating: {
          mu,
          rd: SEED_RD,
          sigma: SEED_SIGMA,
          games: 0,
          peak: mu,
          lastAt: 0,
        },
      };
      const cmd = seedCmdMu(u);
      if (cmd) {
        setDoc.cmdRating = {
          mu: cmd.mu,
          rd: SEED_RD,
          sigma: SEED_SIGMA,
          games: 0,
          peak: cmd.mu,
          lastAt: 0,
        };
        cmdBoard.push({
          name: u.name,
          cmdMu: cmd.mu,
          games: cmd.games,
          cwr: cmd.cwr,
          src: 'seed',
        });
      }
      ops.push({
        updateOne: { filter: { _id: u._id }, update: { $set: setDoc } },
      });
    }

    console.log(
      `Всего игроков: ${total} | посеять: ${toSeed} | пропущено (уже есть рейтинг games>0): ${skipped}`,
    );
    const top = board
      .sort((a, b) => b.mu - a.mu)
      .slice(0, 100)
      .map((r, i) => ({
        '#': i + 1,
        name: r.name,
        mu: r.mu,
        'инф%': r.inf,
        киллы: r.kills,
        src: r.src,
      }));
    console.log(`--- ТОП-100 по ELO (из ${board.length}) ---`);
    console.table(top);

    const topCmd = cmdBoard
      .sort((a, b) => b.cmdMu - a.cmdMu)
      .slice(0, 20)
      .map((r, i) => ({
        '#': i + 1,
        name: r.name,
        cmdMu: r.cmdMu,
        игр: r.games,
        'win%': r.cwr,
        src: r.src,
      }));
    console.log(`--- ТОП-20 командиров (из ${cmdBoard.length}) ---`);
    console.table(topCmd);

    if (APPLY && ops.length) {
      const res = await col.bulkWrite(ops, { ordered: false });
      console.log(`ПРИМЕНЕНО: обновлено ${res.modifiedCount} игроков.`);
    } else {
      console.log(
        'DRY RUN — ничего не записано. Запусти с флагом --apply чтобы применить.',
      );
    }

    await client.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
