# Compatibility-only rollout for installations with additional local plugins.
# Pin BASE_IMAGE to the currently running image ID, not a mutable registry tag.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
ARG PATCH_REVISION
ARG BASE_IMAGE
LABEL ru.rnserver.rcon-patch-revision=${PATCH_REVISION}
LABEL ru.rnserver.rcon-patch-base=${BASE_IMAGE}
WORKDIR /app
COPY src/core/squad-rcon.ts src/core/squad-rcon.ts
RUN node -e "const fs=require('fs');const p='src/core/server.ts';const s=fs.readFileSync(p,'utf8');const from=\"import { Rcon } from 'squad-rcon';\";if(s.split(from).length!==2)throw Error('Unexpected RCON import; inspect before applying');fs.writeFileSync(p,s.replace(from,\"import { SquadRcon as Rcon } from './squad-rcon';\"));"
RUN npm run build
