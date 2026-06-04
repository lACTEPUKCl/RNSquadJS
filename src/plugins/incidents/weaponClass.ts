export type WeaponClass = 'infantry' | 'vehicle' | 'explosive' | 'knife';

// Нож/штык — отдельный класс (мгновенный гриф по своим, ножевые серии).
const KNIFE_RE = /Bayonet|_Knife|Knife_|Bayo|Combat_?Knife/i;

// Взрыв / арта / мина / граната / РПГ — площадной урон. ТК таким оружием
// считаем игровым моментом (не гриф). Для rapid_kills тоже не учитываем.
// ВАЖНО: не ловим стволы с подствольником (…GP25…Rifle) — это пех-оружие,
// сама граната прилетает отдельной строкой (VOG/Projectile).
const EXPLOSIVE_RE =
  /Mortar|Mine|Landmine|Claymore|IED|Satchel|C4|Deployable|Thermite|Explos|Fragmentation|Grenade|_Frag|RKG|RGD|M67|F1_|VOG|RPG_|RPG7|SPG9|SPG_|BM21|Grad|Rocket|Shell|HE_|HEAT_/i;

// Оружие техники — пушки, спарки, коаксиалы, станковые пулемёты, верты.
const VEHICLE_RE =
  /Projectile|Cannon|Coax|Autocannon|2A72|2A42|2A28|2A70|2A46|2A14|L30A1|L30_|M256|Rh120|D81|ZTM|KPVT|Kord|DSHK|DShK|NSV|PKT|PKTM|RHIB|MI8|Mi8|Mi17|Mi24|BMP|BMD|BTR|BRDM|MTLB|MATV|Tigr|Kozak|Arbalet|Kamaz|Kraz|Ural|Quadbike|Tank|T62|T64|T72|T80|FV4034|FV510|FV520|Warrior|Heli|Maxim|Browning|M2_|M2HB|ZU23|AGS17|AGS30|MK19|HMG|Emplacement|Turret/i;

export function weaponClass(weapon: string | null | undefined): WeaponClass {
  const w = weapon ?? '';
  if (!w) return 'infantry';
  if (KNIFE_RE.test(w)) return 'knife';
  if (EXPLOSIVE_RE.test(w)) return 'explosive';
  if (VEHICLE_RE.test(w)) return 'vehicle';
  return 'infantry';
}

// Прямой огонь по своим = намеренный гриф (стрелковое, оружие техники, нож).
// Площадной взрыв (explosive) — игровой момент, в гриф не идёт.
export function isDirectFireClass(c: WeaponClass): boolean {
  return c === 'infantry' || c === 'vehicle' || c === 'knife';
}
