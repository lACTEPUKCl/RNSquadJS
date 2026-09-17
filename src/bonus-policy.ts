export function bonusRate({ isSeed, seedRole, participant, target, serverKey, now = Date.now() }: {
  isSeed: boolean; seedRole: boolean; participant: any; target: any;
  serverKey: string; now?: number;
}): number {
  const fresh = (doc: any) => doc?.active === true &&
    Number.isFinite(new Date(doc.updatedAt).getTime()) &&
    now - new Date(doc.updatedAt).getTime() >= 0 &&
    now - new Date(doc.updatedAt).getTime() <= 90000;
  const onTarget = fresh(target) && target.serverKey === serverKey;
  const enrolled = fresh(participant) && participant.serverKey === serverKey;
  if (onTarget && (seedRole || enrolled)) return 5;
  return isSeed ? 2 : 1;
}
