import {
  LogsReaderEvents,
  TCaptureZone,
  TDeployableSpawned,
  TMapMarkerPlaced,
} from 'squad-logs';

export function worldActivityEntry(
  data: TCaptureZone | TMapMarkerPlaced | TDeployableSpawned,
  currentTime: string,
) {
  const common = { ...data, currentTime, gameTime: data.time };
  if (
    data.event === LogsReaderEvents.CAPTURE_ZONE_CAPTURED ||
    data.event === LogsReaderEvents.CAPTURE_ZONE_NEUTRALIZED
  ) {
    const zone = data as TCaptureZone;
    const captured = data.event === LogsReaderEvents.CAPTURE_ZONE_CAPTURED;
    return {
      ...common,
      action: captured ? 'CaptureZoneCaptured' : 'CaptureZoneNeutralized',
      описание: `Команда ${zone.teamID} ${captured ? 'захватила' : 'нейтрализовала'} точку ${zone.flagName}`,
    };
  }
  if (data.event === LogsReaderEvents.MAP_MARKER_PLACED) {
    const marker = data as TMapMarkerPlaced;
    return {
      ...common,
      action: 'MapMarkerPlaced',
      описание: `${marker.name} поставил метку ${marker.markerType} для команды ${marker.markerTeamID}`,
    };
  }
  const spawn = data as TDeployableSpawned;
  return {
    ...common,
    action: 'DeployableSpawned',
    описание: `${spawn.name || 'Сервер'}: создан ${spawn.deployable} для команды ${spawn.teamID}`,
  };
}
